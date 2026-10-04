from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.opportunity import Opportunity
from app.models.user import User
from app.services.fields import match_field_deterministic, norm
from app.services.opportunity_view import get_profile, visible_to
from app.services.semantic_scholar import find_professors, find_professors_offline

router = APIRouter(prefix="/api/professors", tags=["professors"])

# Opportunity field labels -> search phrasing that finds papers rather than course pages.
FIELD_QUERY = {
    "ai/ml": "machine learning", "computer science": "computer science", "data science": "data science",
    "engineering": "engineering", "public policy": "public policy", "business": "management",
    "natural sciences": "physics chemistry biology", "social sciences": "social science", "medicine": "medicine",
}


class PaperOut(BaseModel):
    title: str | None
    year: int | None
    venue: str | None
    url: str | None
    citations: int = 0


class ProfessorOut(BaseModel):
    author_id: str
    name: str | None
    affiliations: list[str] = []
    topics: list[str] = []
    h_index: int | None = None
    citation_count: int | None = None
    paper_count: int | None = None
    profile_url: str | None = None
    highlight: str | None = None
    sample: bool = False
    recent_papers: list[PaperOut] = []


class ProfessorSearchOut(BaseModel):
    query: str
    source: str  # live | cache | sample
    fetched_at: datetime | None
    authors: list[ProfessorOut]


class CompareAuthorOut(BaseModel):
    name: str
    affiliation: str | None = None
    topic: str | None = None
    profile_url: str | None = None


class CompareProfessorsOut(BaseModel):
    opportunity_id: str
    query: str
    source: Literal["cache", "ai", "sample"]
    fetched_at: datetime | None
    authors: list[CompareAuthorOut]


MAX_COMPARE = 4


def query_for_opportunity(opp: Opportunity, interests: list[str]) -> str:
    fields = [f for f in (opp.fields or []) if norm(f) not in ("general", "any")]
    # Prefer the student's own interests that fit this opportunity: "robotics" beats "engineering".
    relevant = [i for i in interests if any(match_field_deterministic(f, [i]) for f in fields)]
    terms = relevant[:2] or [FIELD_QUERY.get(norm(f), f) for f in fields[:2]]
    return " ".join(terms) or opp.title


@router.get("/compare", response_model=list[CompareProfessorsOut])
def compare_professors(ids: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Up to 3 researchers per compared opportunity, from saved results or AI, never a live
    Semantic Scholar call (a compare page would otherwise fire up to 4 at once)."""
    wanted = list(dict.fromkeys(i.strip() for i in ids.split(",") if i.strip()))
    if len(wanted) > MAX_COMPARE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Compare up to {MAX_COMPARE} opportunities at once")
    profile = get_profile(db, user)
    interests = (profile.interests or []) if profile else []
    out = []
    for opp_id in wanted:
        opp = db.get(Opportunity, opp_id)
        if not opp or not visible_to(user, opp):
            continue
        result = find_professors_offline(db, query_for_opportunity(opp, interests), user, opp)
        out.append({"opportunity_id": opp.id, **result})
    return out


@router.get("", response_model=ProfessorSearchOut)
def search_professors(
    q: str | None = None,
    opportunity_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_profile(db, user)
    interests = (profile.interests or []) if profile else []
    if opportunity_id:
        opp = db.get(Opportunity, opportunity_id)
        if not opp or not visible_to(user, opp):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
        query = query_for_opportunity(opp, interests)
    else:
        query = (q or "").strip() or " ".join(interests[:2])
    if not query:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter a research interest to search for")
    return find_professors(db, query)
