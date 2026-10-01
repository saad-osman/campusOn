"""In-app notifications (always on), plus the fan-out rules for change alerts
(Feature 5) and faculty endorsements (Feature 12). Email/Telegram delivery for
the weekly digest lives in services/digest.py."""
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.opportunity import Opportunity, SavedOpportunity
from app.models.tracker import TrackerItem
from app.models.user import User
from app.models.workspace import WorkspaceMember

DEFAULT_PREFS = {"email_digest": True, "telegram_digest": True, "change_alerts": True, "endorsements": True}


def prefs_for(user: User) -> dict:
    return {**DEFAULT_PREFS, **(user.notification_prefs or {})}


def notify(db: Session, user_id: str, type: str, title: str, body: str | None = None,
           link: str | None = None) -> Notification:
    n = Notification(user_id=user_id, type=type, title=title, body=body, link=link)
    db.add(n)
    return n


def interested_user_ids(db: Session, opp: Opportunity) -> set[str]:
    """Everyone who saved this opportunity (or a merged duplicate of it), or
    belongs to an Application File that tracks it."""
    canonical_id = opp.canonical_id or opp.id
    ids = [canonical_id] + [r.id for r in db.query(Opportunity.id).filter(Opportunity.canonical_id == canonical_id).all()]
    users = {r.user_id for r in db.query(SavedOpportunity.user_id).filter(SavedOpportunity.opportunity_id.in_(ids)).all()}
    ws_ids = {r.workspace_id for r in db.query(TrackerItem.workspace_id).filter(TrackerItem.opportunity_id.in_(ids)).all()}
    if ws_ids:
        users |= {r.user_id for r in db.query(WorkspaceMember.user_id).filter(WorkspaceMember.workspace_id.in_(ws_ids)).all()}
    return users


def notify_change(db: Session, opp: Opportunity, summary: str) -> int:
    """Feature 5: e.g. "Deadline extended: 1 Nov → 15 Nov" to everyone following it."""
    canonical = db.get(Opportunity, opp.canonical_id) if opp.canonical_id else opp
    count = 0
    for user_id in interested_user_ids(db, opp):
        user = db.get(User, user_id)
        if not user or not prefs_for(user)["change_alerts"]:
            continue
        notify(db, user_id, "change_alert", f"{canonical.title}: {summary}",
               "Something changed on an opportunity you're following.", f"/opportunities/{canonical.id}")
        count += 1
    return count
