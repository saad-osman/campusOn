"""Feature 10: personalised weekly digest.

Per student: new matches scoring above 70, deadlines in the next 7 days among
saved/tracked opportunities, and changes to those opportunities. Always
delivered in-app; also by email (SMTP configured + preference on) and Telegram
(bot token set + chat linked + preference on).
"""
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.opportunity import Opportunity, OpportunityChange, SavedOpportunity
from app.models.tracker import TrackerItem
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.services.email import email_enabled, send_email
from app.services.notifications import notify, prefs_for
from app.services.opportunity_view import build_payloads

settings = get_settings()
MATCH_THRESHOLD = 70


def followed_opportunity_ids(db: Session, user: User) -> set[str]:
    ids = {r.opportunity_id for r in db.query(SavedOpportunity.opportunity_id).filter(SavedOpportunity.user_id == user.id).all()}
    ws_ids = [m.workspace_id for m in db.query(WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id == user.id).all()]
    if ws_ids:
        ids |= {r.opportunity_id for r in db.query(TrackerItem.opportunity_id)
                .filter(TrackerItem.workspace_id.in_(ws_ids), TrackerItem.opportunity_id.isnot(None)).all()}
    return ids


def build_digest(db: Session, user: User, since: datetime | None = None, today: date | None = None) -> dict:
    since = since or (user.last_digest_at or datetime.utcnow() - timedelta(days=7))
    today = today or date.today()

    fresh = (
        db.query(Opportunity)
        .filter(Opportunity.canonical_id.is_(None), Opportunity.status == "active", Opportunity.first_seen >= since)
        .all()
    )
    matches = [p for p in build_payloads(db, fresh, user) if (p.get("match") or {}).get("score", 0) > MATCH_THRESHOLD]
    matches.sort(key=lambda p: p["match"]["score"], reverse=True)

    followed = followed_opportunity_ids(db, user)
    opps = db.query(Opportunity).filter(Opportunity.id.in_(followed)).all() if followed else []
    deadlines = sorted(
        [o for o in opps if o.deadline and today <= o.deadline <= today + timedelta(days=7)],
        key=lambda o: o.deadline,
    )
    changes = (
        db.query(OpportunityChange, Opportunity)
        .join(Opportunity, Opportunity.id == OpportunityChange.opportunity_id)
        .filter(OpportunityChange.opportunity_id.in_(followed), OpportunityChange.detected_at >= since)
        .order_by(OpportunityChange.detected_at.desc())
        .all()
    ) if followed else []

    return {
        "matches": [{"id": p["id"], "title": p["title"], "score": p["match"]["score"], "reason": p["match"]["reasons"][0] if p["match"]["reasons"] else ""} for p in matches[:5]],
        "match_count": len(matches),
        "deadlines": [{"id": o.id, "title": o.title, "deadline": o.deadline, "days": (o.deadline - today).days} for o in deadlines],
        "changes": [{"id": o.id, "title": o.title, "summary": c.summary} for c, o in changes[:10]],
    }


def is_empty(d: dict) -> bool:
    return not (d["matches"] or d["deadlines"] or d["changes"])


def render_text(user: User, d: dict, link_base: str | None = None) -> str:
    base = link_base or settings.FRONTEND_ORIGIN
    lines = [f"Hi {user.name.split(' ')[0]}, here's your ScholarRadar week."]
    if d["matches"]:
        lines.append(f"\nNew matches above {MATCH_THRESHOLD} ({d['match_count']}):")
        lines += [f"• {m['title']} ({m['score']}): {m['reason']}\n  {base}/opportunities/{m['id']}" for m in d["matches"]]
    if d["deadlines"]:
        lines.append("\nDeadlines in the next 7 days:")
        lines += [f"• {x['title']}: {x['deadline'].strftime('%d %b')} ({x['days']} days)" for x in d["deadlines"]]
    if d["changes"]:
        lines.append("\nChanges to opportunities you follow:")
        lines += [f"• {c['title']}: {c['summary']}" for c in d["changes"]]
    if is_empty(d):
        lines.append("\nNothing new this week. Your saved opportunities are unchanged.")
    lines.append(f"\nOpen your dashboard: {base}/dashboard")
    return "\n".join(lines)


def summary_title(d: dict) -> str:
    parts = []
    if d["match_count"]:
        parts.append(f"{d['match_count']} new match{'es' if d['match_count'] != 1 else ''}")
    if d["deadlines"]:
        parts.append(f"{len(d['deadlines'])} deadline{'s' if len(d['deadlines']) != 1 else ''} this week")
    if d["changes"]:
        parts.append(f"{len(d['changes'])} change{'s' if len(d['changes']) != 1 else ''}")
    return "Your weekly digest: " + (", ".join(parts) if parts else "all quiet")


def send_digest(db: Session, user: User, *, skip_empty: bool = True) -> dict:
    from app.services import telegram_bot

    d = build_digest(db, user)
    result = {"user_id": user.id, "in_app": False, "email": False, "telegram": False}
    if skip_empty and is_empty(d):
        return result
    text = render_text(user, d)
    notify(db, user.id, "digest", summary_title(d), text, "/dashboard")
    result["in_app"] = True
    prefs = prefs_for(user)
    if prefs["email_digest"] and email_enabled():
        result["email"] = send_email(user.email, summary_title(d), text)
    if prefs["telegram_digest"] and user.telegram_chat_id and telegram_bot.bot_enabled():
        result["telegram"] = telegram_bot.send_message(user.telegram_chat_id, text)
    user.last_digest_at = datetime.utcnow()
    db.commit()
    return result


def send_all_digests(db: Session, *, skip_empty: bool = True) -> dict:
    students = db.query(User).filter(User.role == "student").all()
    results = [send_digest(db, u, skip_empty=skip_empty) for u in students]
    return {
        "students": len(students),
        "in_app": sum(r["in_app"] for r in results),
        "email": sum(r["email"] for r in results),
        "telegram": sum(r["telegram"] for r in results),
    }
