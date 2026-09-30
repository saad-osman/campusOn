"""Feature 7: cross-source deduplication. cosine similarity > 0.9 on the
title+organization embedding AND (same organization OR same deadline +/- 3 days).
"""
from datetime import date

from sqlalchemy.orm import Session

from app.models.opportunity import Opportunity
from app.services.embeddings import cosine_similarity

SIMILARITY_THRESHOLD = 0.9
DEADLINE_TOLERANCE_DAYS = 3


def find_duplicate(
    db: Session, embedding: list[float] | None, organization: str, deadline: date | None
) -> Opportunity | None:
    if not embedding:
        return None
    candidates = (
        db.query(Opportunity)
        .filter(Opportunity.canonical_id.is_(None), Opportunity.status != "broken")
        .all()
    )
    for cand in candidates:
        sim = cosine_similarity(embedding, cand.embedding)
        if sim <= SIMILARITY_THRESHOLD:
            continue
        same_org = (cand.organization or "").strip().lower() == (organization or "").strip().lower()
        same_deadline = bool(
            deadline and cand.deadline and abs((deadline - cand.deadline).days) <= DEADLINE_TOLERANCE_DAYS
        )
        if same_org or same_deadline:
            return cand
    return None
