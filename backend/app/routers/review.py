"""Feature 6: faculty/admin review queue for low-confidence extractions."""
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.models.opportunity import Opportunity, OpportunitySource
from app.models.source import RawPage
from app.models.user import User
from app.schemas.opportunity import OpportunityOut
from app.services.embeddings import embed_opportunity
from app.services.opportunity_view import build_payloads
from app.services.scrape_pipeline import CHANGE_TRACKED_FIELDS, _is_meaningful_status_change, _serialize, record_change

router = APIRouter(prefix="/api/review", tags=["review"])
staff = require_role("faculty", "admin")

EDITABLE = ["title", "organization", "type", "degree_levels", "fields", "funding_type", "funding_amount", "location",
            "is_remote", "open_to_uae_residents", "deadline", "deadline_text", "eligibility", "description_summary"]
EMBEDDING_INPUTS = {"title", "organization", "fields", "description_summary"}


class ReviewEdits(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    organization: str | None = Field(default=None, min_length=1, max_length=255)
    type: Literal["research_internship", "fellowship", "grant", "scholarship", "research_position", "summer_school"] | None = None
    degree_levels: list[Literal["bachelors", "masters", "phd", "postdoc", "any"]] | None = None
    fields: list[str] | None = None
    funding_type: Literal["fully_funded", "partial", "stipend", "unfunded", "unknown"] | None = None
    funding_amount: str | None = None
    location: str | None = None
    is_remote: bool | None = None
    open_to_uae_residents: bool | None = None
    deadline: date | None = None
    deadline_text: str | None = None
    eligibility: dict | None = None
    description_summary: str | None = None


class ReviewAction(BaseModel):
    action: Literal["approve", "reject", "save"]
    edits: ReviewEdits = ReviewEdits()


class ReviewDetail(BaseModel):
    opportunity: OpportunityOut
    raw_text: str | None
    raw_url: str | None
    fetched_at: datetime | None


@router.get("/queue", response_model=list[OpportunityOut])
def review_queue(kind: Literal["pending", "unverified", "broken"] = "pending", user: User = Depends(staff),
                 db: Session = Depends(get_db)):
    q = db.query(Opportunity).filter(Opportunity.canonical_id.is_(None))
    if kind == "pending":
        q = q.filter(Opportunity.status == "pending_review")
    elif kind == "unverified":
        q = q.filter(Opportunity.status == "active", Opportunity.verified.is_(False))
    else:
        q = q.filter(Opportunity.status == "broken")
    rows = q.order_by(Opportunity.overall_confidence.asc()).all()
    return build_payloads(db, rows, user)


@router.get("/{opportunity_id}", response_model=ReviewDetail)
def review_detail(opportunity_id: str, user: User = Depends(staff), db: Session = Depends(get_db)):
    opp = db.get(Opportunity, opportunity_id)
    if not opp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    link = db.query(OpportunitySource).filter(OpportunitySource.opportunity_id == opp.id).first()
    page = None
    if link:
        page = (
            db.query(RawPage)
            .filter(RawPage.source_id == link.source_id, RawPage.url == link.url)
            .order_by(RawPage.fetched_at.desc())
            .first()
        )
    return {
        "opportunity": build_payloads(db, [opp], user)[0],
        "raw_text": page.text_content if page else None,
        "raw_url": link.url if link else None,
        "fetched_at": page.fetched_at if page else None,
    }


@router.patch("/{opportunity_id}", response_model=OpportunityOut)
def review_opportunity(opportunity_id: str, payload: ReviewAction, user: User = Depends(staff),
                       db: Session = Depends(get_db)):
    opp = db.get(Opportunity, opportunity_id)
    if not opp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")

    edits = payload.edits.model_dump(exclude_unset=True)
    before = {f: getattr(opp, f) for f in CHANGE_TRACKED_FIELDS}
    for field, value in edits.items():
        setattr(opp, field, value)
    if EMBEDDING_INPUTS & edits.keys():
        opp.embedding = embed_opportunity({f: getattr(opp, f) for f in ("title", "organization", "fields", "description_summary")})
    if edits:
        # Human corrections are certain; reflect that in the per-field confidence.
        opp.confidence = {**(opp.confidence or {}), **{f: 1.0 for f in edits}}

    if payload.action == "approve":
        opp.verified = True
        opp.verified_by = user.id
        opp.status = "expired" if opp.deadline and opp.deadline < date.today() else "active"
    elif payload.action == "reject":
        opp.verified = False
        opp.verified_by = None
        opp.status = "broken"  # hidden from students, listed for admins
    opp.last_checked = datetime.utcnow()

    # Corrections to tracked fields reach followers like any other change (Feature 5).
    for field in CHANGE_TRACKED_FIELDS:
        old, new = before[field], getattr(opp, field)
        if field == "status" and not _is_meaningful_status_change(old, new):
            continue
        if _serialize(old) != _serialize(new):
            record_change(db, opp, field, old, new)
    db.commit()
    db.refresh(opp)
    return build_payloads(db, [opp], user)[0]
