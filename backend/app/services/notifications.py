"""In-app notifications (always on). Phase 6 adds email/Telegram delivery
according to each user's preferences."""
from sqlalchemy.orm import Session

from app.models.notification import Notification


def notify(db: Session, user_id: str, type: str, title: str, body: str | None = None,
           link: str | None = None) -> Notification:
    n = Notification(user_id=user_id, type=type, title=title, body=body, link=link)
    db.add(n)
    return n
