from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.opportunity import Opportunity, OpportunityChange, SavedOpportunity
from app.models.user import User
from app.schemas.opportunity import OpportunityChangeOut, OpportunityOut, SearchResponse
from app.schemas.search import SearchFilters, SearchRequest
from app.services.opportunity_view import apply_filters, build_payloads, rank, visible_to
from app.services.search_parser import parse_query

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])


def _get_visible(db: Session, user: User, opportunity_id: str) -> Opportunity:
    opp = db.get(Opportunity, opportunity_id)
    if not opp or not visible_to(user, opp):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    return opp


def _candidates(db: Session, user: User, statuses: list[str]) -> list[Opportunity]:
    rows = (
        db.query(Opportunity)
        .filter(Opportunity.canonical_id.is_(None), Opportunity.status.in_(statuses))
        .all()
    )
    return [o for o in rows if visible_to(user, o)]


@router.get("", response_model=list[OpportunityOut])
def list_opportunities(
    status_filter: str | None = None,
    include_expired: bool = False,
    degree_level: str | None = None,
    field: str | None = None,
    type: str | None = None,
    region: str | None = None,
    open_to_uae_residents: bool | None = None,
    q: str | None = None,
    sort: str = "deadline",
    limit: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if status_filter:
        statuses = [status_filter]
    else:
        statuses = ["active", "expired"] if include_expired else ["active"]
    rows = _candidates(db, user, statuses)
    if type:
        rows = [o for o in rows if o.type == type]
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

    payloads = build_payloads(db, rows, user)
    if region or open_to_uae_residents:
        payloads = apply_filters(payloads, SearchFilters(
            regions=[region] if region else [], open_to_uae_residents=open_to_uae_residents,
            include_expired=True,
        ))
    payloads = rank(payloads, {o.id: o for o in rows}, None, sort=sort if sort in ("match", "deadline", "newest") else "deadline")
    return payloads[:limit] if limit else payloads


@router.post("/search", response_model=SearchResponse)
def search(payload: SearchRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Feature 8. A raw `q` is interpreted into filters (shown to the user as
    removable chips); explicit `filters` are applied as-is."""
    parsed_by = None
    if payload.filters is not None:
        filters = payload.filters
    elif payload.q and payload.q.strip():
        filters, parsed_by = parse_query(payload.q)
    else:
        filters = SearchFilters()

    statuses = ["active", "expired"] if filters.include_expired else ["active"]
    rows = _candidates(db, user, statuses)
    payloads = apply_filters(build_payloads(db, rows, user), filters)
    payloads = rank(payloads, {o.id: o for o in rows}, filters.semantic_query, sort=payload.sort)
    return {"filters": filters, "parsed_by": parsed_by, "results": payloads, "total": len(payloads)}


@router.get("/matches/top", response_model=list[OpportunityOut])
def top_matches(limit: int = 6, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Dashboard "Top matches for you" (Feature 2). Hides ones the student can't apply to."""
    payloads = build_payloads(db, _candidates(db, user, ["active"]), user)
    payloads = [p for p in payloads if p.get("match") and p["eligibility_check"]["verdict"] != "not_eligible"]
    payloads.sort(key=lambda p: p["match"]["score"], reverse=True)
    return payloads[: max(1, min(limit, 24))]


@router.get("/saved/mine", response_model=list[OpportunityOut])
def list_saved(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    saved_rows = db.query(SavedOpportunity).filter(SavedOpportunity.user_id == user.id).all()
    opps = [db.get(Opportunity, r.opportunity_id) for r in saved_rows]
    opps = [o for o in opps if o and visible_to(user, o)]
    payloads = build_payloads(db, opps, user)
    return rank(payloads, {o.id: o for o in opps}, None, sort="deadline")


@router.get("/{opportunity_id}", response_model=OpportunityOut)
def get_opportunity(opportunity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    opp = _get_visible(db, user, opportunity_id)
    # Single-item view: worth letting the LLM resolve fuzzy field matches.
    return build_payloads(db, [opp], user, allow_llm_fields=True)[0]


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
