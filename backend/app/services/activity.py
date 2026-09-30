from sqlalchemy.orm import Session

from app.models.tracker import ActivityLog


def log_activity(db: Session, workspace_id: str, user_id: str, action: str, meta: dict | None = None) -> None:
    db.add(ActivityLog(workspace_id=workspace_id, user_id=user_id, action=action, meta=meta or {}))
