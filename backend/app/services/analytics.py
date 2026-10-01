"""Feature 13: numbers behind the admin analytics dashboard and its CSV export."""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.opportunity import Opportunity, OpportunitySource, SavedOpportunity
from app.models.outcome import Outcome
from app.models.profile import Profile
from app.models.source import Source
from app.models.tracker import ActivityLog, TrackerItem
from app.models.user import User
from app.models.workspace import WorkspaceMember

WEEKS = 12
APPLIED_STATUSES = ("submitted", "accepted", "rejected")


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _weekly(dates: list[datetime], today: date) -> list[dict]:
    start = _week_start(today) - timedelta(weeks=WEEKS - 1)
    counts = Counter(_week_start(d.date()) for d in dates if d and d.date() >= start)
    return [
        {"week": (start + timedelta(weeks=i)).isoformat(), "count": counts.get(start + timedelta(weeks=i), 0)}
        for i in range(WEEKS)
    ]


def term_of(d: datetime) -> str:
    """Academic terms: Jan-May Spring, Jun-Jul Summer, Aug-Dec Fall."""
    if d.month <= 5:
        return f"Spring {d.year}"
    if d.month <= 7:
        return f"Summer {d.year}"
    return f"Fall {d.year}"


def regions_by_opportunity(db: Session) -> dict[str, set[str]]:
    rows = (
        db.query(OpportunitySource.opportunity_id, Opportunity.canonical_id, Source.region)
        .join(Source, Source.id == OpportunitySource.source_id)
        .join(Opportunity, Opportunity.id == OpportunitySource.opportunity_id)
        .all()
    )
    out: dict[str, set[str]] = defaultdict(set)
    for opp_id, canonical_id, region in rows:
        out[canonical_id or opp_id].add(region)
    return out


def build_analytics(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    canonical = db.query(Opportunity).filter(Opportunity.canonical_id.is_(None)).all()
    listed = [o for o in canonical if o.status in ("active", "expired")]
    active = [o for o in canonical if o.status == "active"]
    regions = regions_by_opportunity(db)

    by_type = Counter(o.type for o in listed)
    by_funding = Counter(o.funding_type for o in listed)
    by_field = Counter(f for o in listed for f in (o.fields or []) if f != "General")
    by_region = Counter(r for o in listed for r in regions.get(o.id, {"global"}))

    student_ids = {u.id for u in db.query(User.id).filter(User.role == "student").all()}
    applied_ws = {r.workspace_id for r in db.query(TrackerItem.workspace_id).filter(TrackerItem.status.in_(APPLIED_STATUSES)).all()}
    applicants = {r.user_id for r in db.query(WorkspaceMember.user_id).filter(WorkspaceMember.workspace_id.in_(applied_ws)).all()} if applied_ws else set()
    applicants |= {r.user_id for r in db.query(Outcome.user_id).all()}
    applicants &= student_ids

    # Applications per week: cards moved to "submitted" (from the activity log) plus reported outcomes.
    moves = db.query(ActivityLog.created_at, ActivityLog.meta).filter(ActivityLog.action == "tracker_moved").all()
    submitted_at = [created for created, meta in moves if (meta or {}).get("status") == "submitted"]
    saves = [r.created_at for r in db.query(SavedOpportunity.created_at).all()]

    interests = Counter()
    for (values,) in db.query(Profile.interests).join(User, User.id == Profile.user_id).filter(User.role == "student").all():
        for v in values or []:
            interests[v.strip().lower()] += 1

    outcomes = db.query(Outcome, Opportunity).join(Opportunity, Opportunity.id == Outcome.opportunity_id).all()
    per_term: dict[str, Counter] = defaultdict(Counter)
    for o, _ in outcomes:
        per_term[term_of(o.reported_at)][o.result] += 1
    terms = sorted(per_term, key=lambda t: (int(t.split()[1]), ["Spring", "Summer", "Fall"].index(t.split()[0])))

    stories = Counter(opp.title for o, opp in outcomes if o.share_anonymously and o.result == "accepted"
                      and o.reported_at.date() >= today - timedelta(days=365))
    confidences = [o.overall_confidence for o in canonical if o.status in ("active", "pending_review")]

    return {
        "headline": {
            "sources_monitored": db.query(Source).filter(Source.active.is_(True)).count(),
            "active_opportunities": len(active),
            "verified_pct": round(100 * sum(o.verified for o in active) / len(active)) if active else 0,
            "avg_confidence": round(sum(confidences) / len(confidences), 2) if confidences else 0,
            "students_with_application": len(applicants),
            "students_total": len(student_ids),
            "pending_review": sum(o.status == "pending_review" for o in canonical),
            "broken": sum(o.status == "broken" for o in canonical),
        },
        "by_type": [{"name": k, "count": v} for k, v in by_type.most_common()],
        "by_field": [{"name": k, "count": v} for k, v in by_field.most_common(10)],
        "by_funding": [{"name": k, "count": v} for k, v in by_funding.most_common()],
        "by_region": [{"name": k, "count": v} for k, v in by_region.most_common()],
        "new_per_week": _weekly([o.first_seen for o in canonical], today),
        "activity_per_week": [
            {"week": s["week"], "saves": s["count"], "applications": a["count"]}
            for s, a in zip(_weekly(saves, today), _weekly(submitted_at + [o.reported_at for o, _ in outcomes], today))
        ],
        "top_interests": [{"name": k, "count": v} for k, v in interests.most_common(10)],
        "outcomes_per_term": [
            {"term": t, "accepted": per_term[t]["accepted"], "rejected": per_term[t]["rejected"],
             "waitlisted": per_term[t]["waitlisted"]}
            for t in terms
        ],
        "success_stories": [
            f"{n} BPDC student{'s were' if n != 1 else ' was'} accepted to {title} this year"
            for title, n in stories.most_common(6)
        ],
    }


def analytics_csv(data: dict) -> str:
    """Flat CSV of every table on the dashboard: section,label,value[,value2...]."""
    import csv
    import io

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["section", "label", "value", "extra"])
    for k, v in data["headline"].items():
        w.writerow(["headline", k, v, ""])
    for section in ("by_type", "by_field", "by_funding", "by_region", "top_interests"):
        for row in data[section]:
            w.writerow([section, row["name"], row["count"], ""])
    for row in data["new_per_week"]:
        w.writerow(["new_opportunities_per_week", row["week"], row["count"], ""])
    for row in data["activity_per_week"]:
        w.writerow(["saves_and_applications_per_week", row["week"], row["saves"], row["applications"]])
    for row in data["outcomes_per_term"]:
        w.writerow(["outcomes_per_term", row["term"], f"accepted={row['accepted']}",
                    f"rejected={row['rejected']};waitlisted={row['waitlisted']}"])
    for story in data["success_stories"]:
        w.writerow(["success_story", story, "", ""])
    return buf.getvalue()
