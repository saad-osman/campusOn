"""Fetch a real Semantic Scholar snapshot for common professor-finder searches.

    python -m app.snapshot_professors            (run from backend/, against a seeded database)
    python -m app.snapshot_professors --refresh  (re-fetch every search, not just missing ones)

Writes seed/cache/professors_snapshot.json. The seed loads it into the API cache, so on
hosts whose disk resets (Render's free plan) those searches still show real researchers
when Semantic Scholar's shared, key-less rate limit is exhausted. Re-run it now and then to
refresh it. Searches already in the file are kept, so re-running fills in the ones the shared
rate limit skipped. Requests are spaced out to stay polite; failures are skipped, not fatal.
"""
import json
import sys
import time
from datetime import datetime, timezone

import app.models_registry  # noqa: F401  (registers every model)
from app.db import SessionLocal
from app.models.opportunity import Opportunity
from app.models.profile import Profile
from app.models.user import User
from app.routers.professors import query_for_opportunity
from app.services.semantic_scholar import SNAPSHOT_PATH, ScholarUnavailable, fetch_live

# Topics people commonly try, plus the examples shown on the page.
COMMON = [
    "machine learning",
    "computer vision",
    "robotics",
    "natural language processing",
    "deep learning",
    "artificial intelligence",
    "data science",
    "reinforcement learning",
    "multilingual NLP",
    "drone navigation",
    "energy policy",
    "renewable energy",
    "cybersecurity",
    "public policy",
]
PAUSE_SECONDS = 8.0


def _norm(q: str) -> str:
    return " ".join(q.split())[:200]


def collect_queries() -> list[str]:
    db = SessionLocal()
    try:
        queries: list[str] = []
        demo = db.query(User).filter(User.email == "student@demo.com").first()
        profile = db.query(Profile).filter(Profile.user_id == demo.id).first() if demo else None
        interests = list(profile.interests or []) if profile else []
        if interests:
            queries.append(" ".join(interests[:2]))  # the professor page's default search
            queries.extend(interests)
        for opp in db.query(Opportunity).filter(Opportunity.status == "active").all():
            for student_interests in (interests, []):  # the demo student, and a student with none
                q = query_for_opportunity(opp, student_interests)
                if q:
                    queries.append(q)
        queries.extend(COMMON)
    finally:
        db.close()
    seen: set[str] = set()
    unique = []
    for q in map(_norm, queries):
        if q and q.lower() not in seen:
            seen.add(q.lower())
            unique.append(q)
    return unique


def main() -> int:
    existing = {}
    if SNAPSHOT_PATH.exists() and "--refresh" not in sys.argv:
        existing = {e["query"].lower(): e for e in json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))["entries"]}
    queries = [q for q in collect_queries() if q.lower() not in existing]
    print(f"{len(existing)} searches already saved; fetching {len(queries)} from Semantic Scholar ({PAUSE_SECONDS:.0f}s apart)...")
    entries, failed = list(existing.values()), []
    fetched = 0
    for i, q in enumerate(queries, 1):
        try:
            authors = fetch_live(q)
            entries.append({"query": q, "fetched_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), "authors": authors})
            fetched += 1
            print(f"  [{i}/{len(queries)}] ok    {len(authors):2d} researchers  {q}")
        except ScholarUnavailable as e:
            failed.append(q)
            print(f"  [{i}/{len(queries)}] skip  ({e})  {q}")
        time.sleep(PAUSE_SECONDS)
    if not fetched:
        print("Nothing new fetched; leaving the existing snapshot untouched.")
        return 1 if queries else 0
    SNAPSHOT_PATH.write_text(
        json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "entries": entries}, indent=1, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Wrote {len(entries)} searches to {SNAPSHOT_PATH} ({fetched} new, {len(failed)} still missing).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
