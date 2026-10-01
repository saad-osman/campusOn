from datetime import datetime

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.document import Document, DocumentVersion
from app.models.endorsement import Endorsement
from app.models.notification import Notification
from app.models.opportunity import Opportunity, SavedOpportunity
from app.models.outcome import Outcome
from app.models.password_reset import PasswordResetToken
from app.models.tracker import ActivityLog, TrackerItem
from app.models.user import User
from app.models.workspace import Invite, Workspace, WorkspaceMember
from app.services import telegram_bot
from app.services.email import email_enabled
from app.services.notifications import prefs_for

router = APIRouter(prefix="/api/settings", tags=["settings"])
settings = get_settings()


@router.get("/export")
def export_my_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Everything we hold about the user, as JSON (Section 4.1 "download my data")."""
    data = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": user.id, "email": user.email, "name": user.name, "role": user.role,
            "created_at": user.created_at.isoformat(), "telegram_connected": bool(user.telegram_chat_id),
            "notification_prefs": prefs_for(user),
        },
    }
    if user.profile:
        p = user.profile
        data["profile"] = {
            "degree_level": p.degree_level, "year_of_study": p.year_of_study, "major": p.major,
            "cgpa": p.cgpa, "cgpa_scale": p.cgpa_scale, "nationality": p.nationality,
            "country_of_residence": p.country_of_residence, "english_tests": p.english_tests,
            "skills": p.skills, "interests": p.interests, "cv_text": p.cv_text, "cv_filename": p.cv_filename,
        }
    if user.user_state:
        data["state"] = {"last_route": user.user_state.last_route, "ui_state": user.user_state.ui_state}
    saved = (
        db.query(Opportunity.id, Opportunity.title)
        .join(SavedOpportunity, SavedOpportunity.opportunity_id == Opportunity.id)
        .filter(SavedOpportunity.user_id == user.id)
        .all()
    )
    data["saved_opportunities"] = [{"id": i, "title": t} for i, t in saved]
    data["outcomes"] = [
        {"opportunity_id": o.opportunity_id, "result": o.result, "share_anonymously": o.share_anonymously,
         "reported_at": o.reported_at.isoformat()}
        for o in db.query(Outcome).filter(Outcome.user_id == user.id).all()
    ]
    memberships = db.query(WorkspaceMember).filter(WorkspaceMember.user_id == user.id).all()
    data["application_files"] = []
    for m in memberships:
        ws = db.get(Workspace, m.workspace_id)
        if not ws:
            continue
        docs = db.query(Document).filter(Document.workspace_id == ws.id).all()
        data["application_files"].append({
            "name": ws.name, "role": m.role,
            "documents": [{"title": d.title, "type": d.type, "content": d.content} for d in docs],
        })
    data["notifications"] = [
        {"title": n.title, "body": n.body, "created_at": n.created_at.isoformat()}
        for n in db.query(Notification).filter(Notification.user_id == user.id).all()
    ]
    return data


@router.delete("/account", status_code=204)
def delete_my_account(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Removes the account and personal data. Application Files the user solely owns
    are deleted; in shared files they're removed and their name is detached from edits."""
    uid = user.id
    for m in db.query(WorkspaceMember).filter(WorkspaceMember.user_id == uid).all():
        other_owners = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == m.workspace_id, WorkspaceMember.role == "owner",
                    WorkspaceMember.user_id != uid)
            .count()
        )
        others = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == m.workspace_id,
                                                  WorkspaceMember.user_id != uid).all()
        ws = db.get(Workspace, m.workspace_id)
        if m.role == "owner" and not other_owners:
            if others:
                # Hand the file to the longest-standing teammate instead of deleting their work.
                heir = sorted(others, key=lambda x: x.created_at)[0]
                heir.role = "owner"
                ws.owner_id = heir.user_id
            else:
                db.query(TrackerItem).filter(TrackerItem.workspace_id == ws.id).delete()
                db.query(ActivityLog).filter(ActivityLog.workspace_id == ws.id).delete()
                db.delete(ws)
                continue
        db.delete(m)
    db.flush()

    db.query(ActivityLog).filter(ActivityLog.user_id == uid).delete()
    db.query(TrackerItem).filter(TrackerItem.assignee_id == uid).update({"assignee_id": None})
    db.query(Document).filter(Document.updated_by == uid).update({"updated_by": None})
    db.query(DocumentVersion).filter(DocumentVersion.edited_by == uid).update({"edited_by": None})
    db.query(Invite).filter(Invite.invited_by == uid).delete()
    for model in (Notification, SavedOpportunity, Outcome, PasswordResetToken):
        db.query(model).filter(model.user_id == uid).delete()
    db.query(Endorsement).filter(Endorsement.faculty_id == uid).delete()
    db.query(Opportunity).filter(Opportunity.verified_by == uid).update({"verified_by": None})
    db.delete(user)  # cascades to profile (incl. CV text) and user_state
    db.commit()
    response.delete_cookie(settings.COOKIE_NAME, path="/")
    return None


# ---------- notifications & Telegram (Feature 10) ----------

class NotificationPrefs(BaseModel):
    email_digest: bool | None = None
    telegram_digest: bool | None = None
    change_alerts: bool | None = None
    endorsements: bool | None = None


class NotificationSettingsOut(BaseModel):
    prefs: dict
    email_available: bool
    telegram_available: bool
    telegram_connected: bool
    telegram_bot_username: str | None


def _settings_out(user: User) -> dict:
    return {
        "prefs": prefs_for(user),
        "email_available": email_enabled(),
        "telegram_available": telegram_bot.bot_enabled(),
        "telegram_connected": bool(user.telegram_chat_id),
        "telegram_bot_username": telegram_bot.bot_username(),
    }


@router.get("/notifications", response_model=NotificationSettingsOut)
def get_notification_settings(user: User = Depends(get_current_user)):
    return _settings_out(user)


@router.patch("/notifications", response_model=NotificationSettingsOut)
def patch_notification_settings(payload: NotificationPrefs, user: User = Depends(get_current_user),
                                db: Session = Depends(get_db)):
    user.notification_prefs = {**prefs_for(user), **payload.model_dump(exclude_none=True)}
    db.commit()
    return _settings_out(user)


class TelegramCodeOut(BaseModel):
    code: str
    expires_at: datetime
    bot_username: str | None
    bot_running: bool


@router.post("/telegram/code", response_model=TelegramCodeOut)
def create_telegram_code(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code, expires = telegram_bot.new_link_code()
    user.telegram_link_code = code
    user.telegram_link_expires_at = expires
    db.commit()
    return {"code": code, "expires_at": expires, "bot_username": telegram_bot.bot_username(),
            "bot_running": telegram_bot.bot_enabled()}


@router.delete("/telegram", status_code=204)
def disconnect_telegram(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.telegram_chat_id = None
    user.telegram_link_code = None
    db.commit()
    return None
