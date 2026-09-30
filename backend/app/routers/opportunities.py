from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.opportunity import Opportunity, OpportunityChange, OpportunitySource, SavedOpportunity
from app.models.source import Source
from app.models.user import User
from app.schemas.opportunity import OpportunityChangeOut, OpportunityOut

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])


def _linked_sources(db: Session, opp_id: str) -> list[dict]:
    """Sources for a canonical opportunity and every duplicate merged into it (Feature 7)."""
    canonical_and_dupes = [opp_id] + [
        row.id for row in db.query(Opportunity.id).filter(Opportunity.canonical_id == opp_id).all()
    ]
    rows = (
        db.query(OpportunitySource, Source)
        .join(Source, Source.id == OpportunitySource.source_id)
        .filter(OpportunitySource.opportunity_id.in_(canonical_and_dupes))
        .all()
    )
    return [{"name": src.name, "url": link.url, "region": src.region} for link, src in rows]


def _get_visible(db: Session, user: User, opportunity_id: str) -> Opportunity:
    opp = db.get(Opportunity, opportunity_id)
    if not opp or not _visible_to(user, opp):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    return opp


def _to_out(db: Session, opp: Opportunity, user: User | None) -> OpportunityOut:
    saved = False
    if user:
        saved = (
            db.query(SavedOpportunity)
            .filter(SavedOpportunity.user_id == user.id, SavedOpportunity.opportunity_id == opp.id)
            .first()
            is not None
        )
    data = OpportunityOut.model_validate(opp).model_dump()
    data["sources"] = _linked_sources(db, opp.id)
    data["source_count"] = len(data["sources"])
    data["saved"] = saved
    return data


STAFF_ROLES = ("faculty", "admin")
STUDENT_VISIBLE_STATUSES = {"active", "expired"}


def _visible_to(user: User, opp: Opportunity) -> bool:
    # Broken links are hidden from students and unreviewed extractions aren't
    # shown until faculty approve them (Feature 6); staff see everything.
    return user.role in STAFF_ROLES or opp.status in STUDENT_VISIBLE_STATUSES


@router.get("", response_model=list[OpportunityOut])
def list_opportunities(
    status_filter: str | None = None,
    include_expired: bool = False,
    degree_level: str | None = None,
    field: str | None = None,
    type: str | None = None,
    q: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Opportunity).filter(Opportunity.canonical_id.is_(None))
    if status_filter:
        query = query.filter(Opportunity.status == status_filter)
    else:
        statuses = ["active", "expired"] if include_expired else ["active"]
        query = query.filter(Opportunity.status.in_(statuses))
    if type:
        query = query.filter(Opportunity.type == type)

    # JSON-column filters run in Python: small dataset, no pgvector/JSON operators in SQLite.
    rows = [o for o in query.all() if _visible_to(user, o)]
    if degree_level:
        rows = [o for o in rows if degree_level in (o.degree_levels or []) or "any" in (o.degree_levels or [])]
    if field:
        field_lower = field.lower()
        rows = [o for o in rows if any(f.lower() == field_lower for f in (o.fields or []))]
    if q:
        q_lower = q.lower()
        rows = [
            o for o in rows
            if q_lower in o.title.lower() or q_lower in o.organization.lower()
            or any(q_lower in f.lower() for f in (o.fields or []))
        ]
    rows.sort(key=lambda o: (o.deadline is None, o.deadline or o.first_seen.date()))
    return [_to_out(db, o, user) for o in rows]


@router.get("/saved/mine", response_model=list[OpportunityOut])
def list_saved(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    saved_rows = db.query(SavedOpportunity).filter(SavedOpportunity.user_id == user.id).all()
    opps = [db.get(Opportunity, r.opportunity_id) for r in saved_rows]
    return [_to_out(db, o, user) for o in opps if o and _visible_to(user, o)]


@router.get("/{opportunity_id}", response_model=OpportunityOut)
def get_opportunity(opportunity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _to_out(db, _get_visible(db, user, opportunity_id), user)


@router.get("/{opportunity_id}/changes", response_model=list[OpportunityChangeOut])
def get_opportunity_changes(
    opportunity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    opp = _get_visible(db, user, opportunity_id)
    ids = [opp.id] + [
        row.id for row in db.query(Opportunity.id).filter(Opportunity.canonical_id == opp.id).all()
    ]
    return (
        db.query(OpportunityChange)
        .filter(OpportunityChange.opportunity_id.in_(ids))
        .order_by(OpportunityChange.detected_at.desc())
        .all()
    )


@router.post("/{opportunity_id}/save", status_code=status.HTTP_204_NO_CONTENT)
def save_opportunity(opportunity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_visible(db, user, opportunity_id)
    existing = (
        db.query(SavedOpportunity)
        .filter(SavedOpportunity.user_id == user.id, SavedOpportunity.opportunity_id == opportunity_id)
        .first()
    )
    if not existing:
        db.add(SavedOpportunity(user_id=user.id, opportunity_id=opportunity_id))
        db.commit()
    return None


@router.delete("/{opportunity_id}/save", status_code=status.HTTP_204_NO_CONTENT)
def unsave_opportunity(opportunity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(SavedOpportunity).filter(
        SavedOpportunity.user_id == user.id, SavedOpportunity.opportunity_id == opportunity_id
    ).delete()
    db.commit()
    return None
