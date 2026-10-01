"""Feature 14: public read-only API, RSS feed. Active, non-broken listings only and
no personal data (no match scores, saves, endorsement notes, or user info).
CORS is open for these paths (see main.py)."""
from datetime import date, datetime
from email.utils import format_datetime
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.opportunity import Opportunity
from app.services.analytics import regions_by_opportunity
from app.services.fields import match_field_deterministic

router = APIRouter(tags=["public"])
settings = get_settings()


class PublicOpportunity(BaseModel):
    id: str
    title: str
    organization: str
    type: str
    degree_levels: list[str]
    fields: list[str]
    funding_type: str
    funding_amount: str | None
    location: str | None
    is_remote: bool
    open_to_uae_residents: bool | None
    deadline: date | None
    deadline_text: str | None
    verified: bool
    regions: list[str]
    official_url: str | None
    scholarradar_url: str
    last_checked: datetime


def _public(o: Opportunity, regions: dict[str, set[str]]) -> dict:
    return {
        "id": o.id, "title": o.title, "organization": o.organization, "type": o.type,
        "degree_levels": o.degree_levels or [], "fields": o.fields or [], "funding_type": o.funding_type,
        "funding_amount": o.funding_amount, "location": o.location, "is_remote": o.is_remote,
        "open_to_uae_residents": o.open_to_uae_residents, "deadline": o.deadline, "deadline_text": o.deadline_text,
        "verified": o.verified, "regions": sorted(regions.get(o.id, set())), "official_url": o.url,
        "scholarradar_url": f"{settings.FRONTEND_ORIGIN}/opportunities/{o.id}", "last_checked": o.last_checked,
    }


def _query(db: Session, degree: str | None, field: str | None, type: str | None, region: str | None,
           limit: int) -> tuple[list[Opportunity], dict[str, set[str]]]:
    rows = db.query(Opportunity).filter(Opportunity.canonical_id.is_(None), Opportunity.status == "active").all()
    regions = regions_by_opportunity(db)
    today = date.today()
    rows = [o for o in rows if not o.deadline or o.deadline >= today]
    if degree:
        rows = [o for o in rows if degree in (o.degree_levels or []) or "any" in (o.degree_levels or [])]
    if field:
        rows = [o for o in rows if match_field_deterministic(field, o.fields or [])]
    if type:
        rows = [o for o in rows if o.type == type]
    if region:
        rows = [o for o in rows if region in regions.get(o.id, set())]
    rows.sort(key=lambda o: (o.deadline is None, o.deadline or date.max))
    return rows[:limit], regions


@router.get("/api/public/opportunities", response_model=list[PublicOpportunity])
def public_list(
    degree: str | None = None,
    field: str | None = None,
    type: str | None = None,
    region: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows, regions = _query(db, degree, field, type, region, limit)
    return [_public(o, regions) for o in rows]


@router.get("/api/public/opportunities/{opportunity_id}", response_model=PublicOpportunity)
def public_detail(opportunity_id: str, db: Session = Depends(get_db)):
    o = db.get(Opportunity, opportunity_id)
    if not o or o.status != "active" or o.canonical_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    return _public(o, regions_by_opportunity(db))


@router.get("/feed.xml")
def rss_feed(
    degree: str | None = None,
    field: str | None = None,
    type: str | None = None,
    region: str | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows, _ = _query(db, degree, field, type, region, limit)
    site = settings.FRONTEND_ORIGIN
    items = []
    for o in rows:
        link = f"{site}/opportunities/{o.id}"
        deadline = o.deadline.strftime("%d %b %Y") if o.deadline else (o.deadline_text or "rolling")
        desc = f"{o.organization}. {o.type.replace('_', ' ').capitalize()}, {o.funding_type.replace('_', ' ')}. Deadline: {deadline}."
        items.append(
            "<item>"
            f"<title>{escape(o.title)}</title>"
            f"<link>{escape(link)}</link>"
            f"<guid isPermaLink=\"false\">{o.id}</guid>"
            f"<description>{escape(desc)}</description>"
            + "".join(f"<category>{escape(f)}</category>" for f in (o.fields or []))
            + f"<pubDate>{format_datetime(o.first_seen.replace(tzinfo=None), usegmt=False)}</pubDate>"
            "</item>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0"><channel>'
        "<title>ScholarRadar: research opportunities</title>"
        f"<link>{escape(site)}/discover</link>"
        "<description>Research internships, fellowships and scholarships, checked and deduplicated.</description>"
        "<language>en</language>"
        + "".join(items)
        + "</channel></rss>"
    )
    return Response(content=xml, media_type="application/rss+xml; charset=utf-8")
