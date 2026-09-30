"""Orchestrates one source through: fetch -> skip-if-unchanged -> extract ->
embed -> dedupe -> change detection -> expiry/broken-link bookkeeping.
Logs every run to ScrapeRun (Section 7).

`ingest_page_text` holds the extract-onward logic and is reused directly by
the seed script (backend/app/seed.py) with canned page text, so seeding
exercises the exact same extraction/dedup/confidence pipeline a live scrape
would -- just without the network fetch.
"""
import json
from datetime import date, datetime

from dateutil import parser as dateparser
from sqlalchemy.orm import Session

from app.models.opportunity import Opportunity, OpportunityChange, OpportunitySource
from app.models.scrape_run import ScrapeRun
from app.models.source import RawPage, Source
from app.services.dedupe import find_duplicate
from app.services.embeddings import embed_opportunity
from app.services.extractor import extract_opportunity
from app.services.scraper import ScrapeBlocked, ScrapeFailed, content_hash, extract_text, fetch_page

# Key fields diffed on re-scrape (Feature 5).
CHANGE_TRACKED_FIELDS = ["deadline", "eligibility", "funding_type", "funding_amount", "status"]

# Fields copied from extractor output onto an Opportunity row.
EXTRACTED_FIELDS = [
    "title", "organization", "type", "degree_levels", "fields", "funding_type", "funding_amount",
    "location", "is_remote", "open_to_uae_residents", "deadline_text", "eligibility",
    "description_summary", "confidence",
]

BROKEN_AFTER_CONSECUTIVE_404S = 2


def _parse_deadline(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return dateparser.parse(value).date()
    except Exception:
        return None


def _fmt_date(d: date | None) -> str:
    return f"{d.day} {d.strftime('%b %Y')}" if d else "none"


def _serialize(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True)
    return str(value)


def _change_summary(field: str, old, new) -> str:
    if field == "deadline":
        if old and new:
            verb = "extended" if new > old else "moved earlier"
            return f"Deadline {verb}: {_fmt_date(old)} → {_fmt_date(new)}"
        return f"Deadline set: {_fmt_date(new)}" if new else f"Deadline removed (was {_fmt_date(old)})"
    if field == "funding_type":
        pretty = lambda v: (v or "unknown").replace("_", " ")  # noqa: E731
        return f"Funding changed: {pretty(old)} → {pretty(new)}"
    if field == "funding_amount":
        return f"Funding amount changed: {old or 'not stated'} → {new or 'not stated'}"
    if field == "eligibility":
        return "Eligibility requirements updated"
    if field == "status":
        return f"Status changed: {old} → {new}"
    return f"{field} changed"


def record_change(db: Session, opp: Opportunity, field: str, old, new) -> OpportunityChange:
    change = OpportunityChange(
        opportunity_id=opp.id, field=field,
        old_value=_serialize(old), new_value=_serialize(new),
        summary=_change_summary(field, old, new),
    )
    db.add(change)
    # Phase 6 hooks notifications for users who saved/track `opp` onto these rows.
    return change


def _is_meaningful_status_change(old: str, new: str) -> bool:
    # active <-> pending_review flips reflect extraction confidence, not a change
    # to the opportunity itself, so they don't belong in the student-facing timeline.
    return old != new and "pending_review" not in (old, new)


def _existing_opportunity_for_url(db: Session, source_id: str, url: str) -> Opportunity | None:
    link = (
        db.query(OpportunitySource)
        .filter(OpportunitySource.source_id == source_id, OpportunitySource.url == url)
        .order_by(OpportunitySource.created_at.desc())
        .first()
    )
    if not link:
        return None
    return db.get(Opportunity, link.opportunity_id)


def _apply_extracted(opp: Opportunity, extracted: dict, deadline: date | None, embedding, status: str) -> None:
    for field in EXTRACTED_FIELDS:
        default = {} if field in ("eligibility", "confidence") else None
        setattr(opp, field, extracted.get(field, default))
    opp.is_remote = bool(extracted.get("is_remote", False))
    opp.url = extracted.get("url") or opp.url
    opp.deadline = deadline
    opp.overall_confidence = float(extracted.get("overall_confidence", 0.0))
    opp.embedding = embedding
    opp.last_checked = datetime.utcnow()
    opp.broken_count = 0
    if opp.status != "broken":
        opp.status = status


def ingest_page_text(db: Session, source: Source, url: str, text: str, run: ScrapeRun | None = None) -> dict:
    """Runs one page's already-fetched text through extraction/embedding/dedupe/
    change-detection and persists the result. Returns a small summary dict.
    Pass the same `run` across calls to accumulate new/updated/merged counts.
    """
    now = datetime.utcnow()
    new_hash = content_hash(text)
    last_page = (
        db.query(RawPage)
        .filter(RawPage.source_id == source.id, RawPage.url == url)
        .order_by(RawPage.fetched_at.desc())
        .first()
    )
    existing_for_url = _existing_opportunity_for_url(db, source.id, url)

    if last_page is not None and last_page.content_hash == new_hash:
        # Never re-process unchanged pages (Section 7) -- just record that we looked.
        last_page.fetched_at = now
        if existing_for_url:
            existing_for_url.last_checked = now
            existing_for_url.broken_count = 0
        source.last_status = "unchanged"
        source.last_checked = now
        db.commit()
        return {"action": "unchanged", "opportunity_id": existing_for_url.id if existing_for_url else None}

    db.add(RawPage(source_id=source.id, url=url, content_hash=new_hash, text_content=text, http_status=200))

    extracted, method = extract_opportunity(text, source.name, url)
    embedding = embed_opportunity(extracted)
    deadline = _parse_deadline(extracted.get("deadline"))

    overall_confidence = float(extracted.get("overall_confidence", 0.0))
    needs_review = overall_confidence < 0.7 or not deadline
    opp_status = "pending_review" if needs_review else "active"
    if deadline and deadline < date.today() and not needs_review:
        opp_status = "expired"

    if existing_for_url:
        opp = existing_for_url
        old_values = {f: getattr(opp, f) for f in CHANGE_TRACKED_FIELDS}
        _apply_extracted(opp, extracted, deadline, embedding, opp_status)

        changed_fields = []
        for field in CHANGE_TRACKED_FIELDS:
            old, new = old_values[field], getattr(opp, field)
            if field == "status" and not _is_meaningful_status_change(old, new):
                continue
            if _serialize(old) != _serialize(new):
                record_change(db, opp, field, old, new)
                changed_fields.append(field)
        if opp.verified and changed_fields:
            # Faculty verified the old content; it needs another look now.
            opp.verified = False
            opp.verified_by = None
        if run:
            run.updated_count += 1
        result = {"action": "updated", "opportunity_id": opp.id, "changed_fields": changed_fields}

    else:
        duplicate_of = find_duplicate(db, embedding, extracted.get("organization", ""), deadline)
        opp = Opportunity(canonical_id=duplicate_of.id if duplicate_of else None, first_seen=now)
        _apply_extracted(opp, extracted, deadline, embedding, opp_status)
        db.add(opp)
        db.flush()
        db.add(OpportunitySource(opportunity_id=opp.id, source_id=source.id, url=url))
        if duplicate_of:
            duplicate_of.last_checked = now
            if run:
                run.merged_count += 1
            result = {"action": "merged", "opportunity_id": opp.id, "canonical_id": duplicate_of.id}
        else:
            if run:
                run.new_count += 1
            result = {"action": "inserted", "opportunity_id": opp.id}

    source.last_status = "ok"
    source.last_checked = now
    db.commit()
    result["method"] = method
    result["confidence"] = overall_confidence
    return result


def mark_url_not_found(db: Session, source: Source, url: str, status_code: int) -> Opportunity | None:
    """404/410 bookkeeping: two in a row -> status `broken` (Feature 6)."""
    opp = _existing_opportunity_for_url(db, source.id, url)
    if opp:
        opp.broken_count += 1
        opp.last_checked = datetime.utcnow()
        if opp.broken_count >= BROKEN_AFTER_CONSECUTIVE_404S and opp.status != "broken":
            record_change(db, opp, "status", opp.status, "broken")
            opp.status = "broken"
    source.last_status = f"http_{status_code}"
    source.last_checked = datetime.utcnow()
    db.commit()
    return opp


def _finish(db: Session, run: ScrapeRun, status: str, detail: dict) -> ScrapeRun:
    run.status = status
    run.detail = detail
    run.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(run)
    return run


def run_scrape_for_source(db: Session, source: Source) -> ScrapeRun:
    run = ScrapeRun(source_id=source.id, status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        html, status_code = fetch_page(source.base_url)
        run.pages_fetched = 1

        if status_code in (404, 410):
            opp = mark_url_not_found(db, source, source.base_url, status_code)
            return _finish(db, run, "ok", {
                "http_status": status_code,
                "opportunity_id": opp.id if opp else None,
                "broken": bool(opp and opp.status == "broken"),
            })
        if status_code >= 400:
            source.last_status = f"http_{status_code}"
            source.last_checked = datetime.utcnow()
            run.failed_count = 1
            return _finish(db, run, "failed", {"http_status": status_code})

        text = extract_text(html)
        result = ingest_page_text(db, source, source.base_url, text, run=run)
        return _finish(db, run, "ok", result)

    except ScrapeBlocked as e:
        source.last_status = "blocked_by_robots"
        source.last_checked = datetime.utcnow()
        run.failed_count = 1
        return _finish(db, run, "failed", {"error": str(e)})
    except ScrapeFailed as e:
        source.last_status = "fetch_failed"
        source.last_checked = datetime.utcnow()
        run.failed_count = 1
        return _finish(db, run, "failed", {"error": str(e)})
    except Exception as e:  # extraction/embedding bug -- still log the run
        db.rollback()
        source.last_status = "error"
        source.last_checked = datetime.utcnow()
        run.failed_count = 1
        return _finish(db, run, "failed", {"error": f"{type(e).__name__}: {e}"})


def archive_expired(db: Session) -> int:
    """Daily job: deadline passed -> status=expired (Feature 6)."""
    today = date.today()
    rows = (
        db.query(Opportunity)
        .filter(Opportunity.status == "active", Opportunity.deadline.isnot(None), Opportunity.deadline < today)
        .all()
    )
    for opp in rows:
        record_change(db, opp, "status", opp.status, "expired")
        opp.status = "expired"
    db.commit()
    return len(rows)
