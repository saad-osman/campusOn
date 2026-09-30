from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.workspace import Invite, Workspace, WorkspaceMember
from app.schemas.workspace import InvitePreview, WorkspaceMemberOut
from app.services.activity import log_activity

router = APIRouter(prefix="/api/invites", tags=["invites"])


def _get_invite_or_404(db: Session, token: str) -> Invite:
    invite = db.query(Invite).filter(Invite.token == token).first()
    if not invite:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found")
    return invite


@router.get("/{token}", response_model=InvitePreview)
def preview_invite(token: str, db: Session = Depends(get_db)):
    invite = _get_invite_or_404(db, token)
    ws = db.get(Workspace, invite.workspace_id)
    inviter = db.get(User, invite.invited_by)
    return InvitePreview(
        workspace_name=ws.name if ws else "Unknown",
        workspace_icon=ws.icon if ws else "\U0001F4C1",
        role=invite.role,
        invited_by_name=inviter.name if inviter else "Someone",
        expired=invite.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc),
        already_accepted=invite.accepted_at is not None,
    )


@router.post("/{token}/accept", response_model=WorkspaceMemberOut)
def accept_invite(
    token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = _get_invite_or_404(db, token)
    if invite.accepted_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invite has already been used")
    if invite.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invite has expired")

    existing = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == invite.workspace_id, WorkspaceMember.user_id == user.id)
        .first()
    )
    if existing:
        invite.accepted_at = datetime.now(timezone.utc)
        db.commit()
        return {"id": existing.id, "user_id": existing.user_id, "role": existing.role, "name": user.name, "email": user.email}

    member = WorkspaceMember(workspace_id=invite.workspace_id, user_id=user.id, role=invite.role)
    db.add(member)
    invite.accepted_at = datetime.now(timezone.utc)
    log_activity(db, invite.workspace_id, user.id, "invite_accepted", {"role": invite.role})
    db.commit()
    db.refresh(member)
    return {"id": member.id, "user_id": member.user_id, "role": member.role, "name": user.name, "email": user.email}
