import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.document import Document
from app.models.opportunity import Opportunity
from app.models.tracker import ActivityLog, TrackerItem
from app.models.user import User
from app.models.workspace import Invite, Workspace, WorkspaceMember
from app.schemas.workspace import (
    ActivityLogOut,
    DocumentCreate,
    DocumentOut,
    InviteCreate,
    InviteOut,
    MemberRolePatch,
    WorkspaceCreate,
    WorkspaceMemberOut,
    WorkspaceOut,
    WorkspacePatch,
)
from app.services.activity import log_activity
from app.services.email import send_email
from app.services.notifications import notify
from app.services.readiness import compute_readiness
from app.services.workspace_access import require_workspace_role

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])
settings = get_settings()

TEMPLATE_DOCS = {
    "blank": [],
    "single_application": [
        ("sop", "Statement of Purpose"),
        ("cold_email", "Cold Email Draft"),
        ("checklist", "Application Checklist"),
    ],
    "scholarship_hunt": [
        ("notes", "Research Notes"),
    ],
}


def _to_workspace_out(ws: Workspace, my_role: str, db: Session) -> dict:
    members = (
        db.query(User.id, User.name)
        .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .filter(WorkspaceMember.workspace_id == ws.id)
        .all()
    )
    docs = db.query(Document.type, Document.title, Document.content).filter(Document.workspace_id == ws.id).all()
    opp_ids = [r.opportunity_id for r in db.query(TrackerItem.opportunity_id)
               .filter(TrackerItem.workspace_id == ws.id, TrackerItem.opportunity_id.isnot(None)).all()]
    upcoming = (
        db.query(Opportunity.deadline)
        .filter(Opportunity.id.in_(opp_ids), Opportunity.deadline >= date.today())
        .order_by(Opportunity.deadline)
        .first()
    ) if opp_ids else None
    last = (
        db.query(ActivityLog.created_at)
        .filter(ActivityLog.workspace_id == ws.id)
        .order_by(ActivityLog.created_at.desc())
        .first()
    )
    return {
        "members": [{"user_id": m.id, "name": m.name} for m in members],
        "member_count": len(members),
        "opportunity_count": len(opp_ids),
        "nearest_deadline": upcoming[0] if upcoming else None,
        "readiness": compute_readiness(docs, upcoming[0] if upcoming else None),
        "last_activity_at": last[0] if last else ws.updated_at,
        "id": ws.id,
        "name": ws.name,
        "description": ws.description,
        "icon": ws.icon,
        "owner_id": ws.owner_id,
        "archived": ws.archived,
        "created_at": ws.created_at,
        "updated_at": ws.updated_at,
        "my_role": my_role,
        "document_count": len(docs),
    }


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = Workspace(name=payload.name, description=payload.description, icon=payload.icon, owner_id=user.id)
    db.add(ws)
    db.flush()

    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="owner"))

    for doc_type, title in TEMPLATE_DOCS[payload.template]:
        db.add(Document(workspace_id=ws.id, type=doc_type, title=title, content="", updated_by=user.id))

    log_activity(db, ws.id, user.id, "workspace_created", {"name": ws.name, "template": payload.template})
    db.commit()
    db.refresh(ws)
    return _to_workspace_out(ws, "owner", db)


@router.get("", response_model=list[WorkspaceOut])
def list_workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memberships = db.query(WorkspaceMember).filter(WorkspaceMember.user_id == user.id).all()
    out = []
    for m in memberships:
        ws = db.get(Workspace, m.workspace_id)
        if ws:
            out.append(_to_workspace_out(ws, m.role, db))
    out.sort(key=lambda w: w["updated_at"], reverse=True)
    return out


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def get_workspace(
    workspace_id: str,
    member: WorkspaceMember = Depends(require_workspace_role("viewer")),
    db: Session = Depends(get_db),
):
    ws = db.get(Workspace, workspace_id)
    return _to_workspace_out(ws, member.role, db)


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
def patch_workspace(
    workspace_id: str,
    payload: WorkspacePatch,
    member: WorkspaceMember = Depends(require_workspace_role("owner")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.get(Workspace, workspace_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(ws, field, value)
    if changes:
        log_activity(db, workspace_id, user.id, "workspace_updated", changes)
    db.commit()
    db.refresh(ws)
    return _to_workspace_out(ws, member.role, db)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: str,
    member: WorkspaceMember = Depends(require_workspace_role("owner")),
    db: Session = Depends(get_db),
):
    ws = db.get(Workspace, workspace_id)
    # Members, documents and invites cascade via the ORM; these tables don't.
    db.query(TrackerItem).filter(TrackerItem.workspace_id == workspace_id).delete()
    db.query(ActivityLog).filter(ActivityLog.workspace_id == workspace_id).delete()
    db.delete(ws)
    db.commit()
    return None


@router.post("/{workspace_id}/duplicate", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def duplicate_workspace(
    workspace_id: str,
    member: WorkspaceMember = Depends(require_workspace_role("owner")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    original = db.get(Workspace, workspace_id)
    copy = Workspace(
        name=f"{original.name} (copy)",
        description=original.description,
        icon=original.icon,
        owner_id=user.id,
    )
    db.add(copy)
    db.flush()
    db.add(WorkspaceMember(workspace_id=copy.id, user_id=user.id, role="owner"))

    for doc in db.query(Document).filter(Document.workspace_id == workspace_id).all():
        db.add(Document(workspace_id=copy.id, type=doc.type, title=doc.title, content=doc.content,
                        opportunity_id=doc.opportunity_id, updated_by=user.id))
    for item in db.query(TrackerItem).filter(TrackerItem.workspace_id == workspace_id).all():
        db.add(TrackerItem(workspace_id=copy.id, opportunity_id=item.opportunity_id, status=item.status,
                           notes=item.notes, position=item.position))

    log_activity(db, copy.id, user.id, "workspace_duplicated", {"from": workspace_id})
    db.commit()
    db.refresh(copy)
    return _to_workspace_out(copy, "owner", db)


# ---------- members ----------

@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
def list_members(
    workspace_id: str,
    _: WorkspaceMember = Depends(require_workspace_role("viewer")),
    db: Session = Depends(get_db),
):
    rows = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all()
    out = []
    for m in rows:
        u = db.get(User, m.user_id)
        out.append({"id": m.id, "user_id": m.user_id, "role": m.role, "name": u.name, "email": u.email})
    return out


@router.patch("/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberOut)
def update_member_role(
    workspace_id: str,
    member_id: str,
    payload: MemberRolePatch,
    _: WorkspaceMember = Depends(require_workspace_role("owner")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.get(WorkspaceMember, member_id)
    if not target or target.workspace_id != workspace_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    if target.role == "owner" and payload.role != "owner":
        remaining_owners = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.role == "owner")
            .count()
        )
        if remaining_owners <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An Application File must keep at least one owner")

    target.role = payload.role
    log_activity(db, workspace_id, user.id, "member_role_changed", {"member_id": member_id, "role": payload.role})
    db.commit()
    db.refresh(target)
    u = db.get(User, target.user_id)
    return {"id": target.id, "user_id": target.user_id, "role": target.role, "name": u.name, "email": u.email}


@router.delete("/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    workspace_id: str,
    member_id: str,
    _: WorkspaceMember = Depends(require_workspace_role("owner")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.get(WorkspaceMember, member_id)
    if not target or target.workspace_id != workspace_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    if target.role == "owner":
        remaining_owners = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.role == "owner")
            .count()
        )
        if remaining_owners <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An Application File must keep at least one owner")

    log_activity(db, workspace_id, user.id, "member_removed", {"member_id": member_id})
    db.delete(target)
    db.commit()
    return None


# ---------- invites ----------

@router.post("/{workspace_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def create_invite(
    workspace_id: str,
    payload: InviteCreate,
    _: WorkspaceMember = Depends(require_workspace_role("editor")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing_user = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing_user:
        already_member = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == existing_user.id)
            .first()
        )
        if already_member:
            raise HTTPException(status.HTTP_409_CONFLICT, "This person is already on the Application File")

    token = secrets.token_urlsafe(24)
    invite = Invite(
        workspace_id=workspace_id,
        email=payload.email.lower(),
        role=payload.role,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        invited_by=user.id,
    )
    db.add(invite)
    log_activity(db, workspace_id, user.id, "invite_created", {"email": payload.email})
    db.commit()
    db.refresh(invite)

    ws = db.get(Workspace, workspace_id)
    invite_link = f"{settings.FRONTEND_ORIGIN}/invite/{token}"
    send_email(  # no-op without SMTP; the copyable link in the UI still works
        invite.email, f"{user.name} invited you to “{ws.name}” on Lodestar",
        f"{user.name} invited you to collaborate on the Application File “{ws.name}” as {payload.role}.\n\n"
        f"Accept the invite (valid for 7 days):\n{invite_link}\n",
    )
    if existing_user:
        notify(db, existing_user.id, "invite", f"{user.name} invited you to “{ws.name}”",
               f"Join as {payload.role}.", f"/invite/{token}")
        db.commit()

    return InviteOut(
        id=invite.id,
        workspace_id=invite.workspace_id,
        email=invite.email,
        role=invite.role,
        token=invite.token,
        expires_at=invite.expires_at,
        accepted_at=invite.accepted_at,
        invite_link=f"{settings.FRONTEND_ORIGIN}/invite/{token}",
    )


@router.get("/{workspace_id}/invites", response_model=list[InviteOut])
def list_invites(
    workspace_id: str,
    _: WorkspaceMember = Depends(require_workspace_role("editor")),
    db: Session = Depends(get_db),
):
    rows = db.query(Invite).filter(Invite.workspace_id == workspace_id, Invite.accepted_at.is_(None)).all()
    return [
        InviteOut(
            id=inv.id,
            workspace_id=inv.workspace_id,
            email=inv.email,
            role=inv.role,
            token=inv.token,
            expires_at=inv.expires_at,
            accepted_at=inv.accepted_at,
            invite_link=f"{settings.FRONTEND_ORIGIN}/invite/{inv.token}",
        )
        for inv in rows
    ]


# ---------- documents ----------

@router.post("/{workspace_id}/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def create_document(
    workspace_id: str,
    payload: DocumentCreate,
    _: WorkspaceMember = Depends(require_workspace_role("editor")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = Document(
        workspace_id=workspace_id,
        type=payload.type,
        title=payload.title,
        opportunity_id=payload.opportunity_id,
        content="",
        updated_by=user.id,
    )
    db.add(doc)
    log_activity(db, workspace_id, user.id, "document_created", {"title": payload.title, "type": payload.type})
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{workspace_id}/documents", response_model=list[DocumentOut])
def list_documents(
    workspace_id: str,
    _: WorkspaceMember = Depends(require_workspace_role("viewer")),
    db: Session = Depends(get_db),
):
    return db.query(Document).filter(Document.workspace_id == workspace_id).order_by(Document.created_at).all()


# ---------- activity ----------

@router.get("/{workspace_id}/activity", response_model=list[ActivityLogOut])
def get_activity(
    workspace_id: str,
    _: WorkspaceMember = Depends(require_workspace_role("viewer")),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ActivityLog)
        .filter(ActivityLog.workspace_id == workspace_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(50)
        .all()
    )
    out = []
    for a in rows:
        u = db.get(User, a.user_id)
        out.append(
            {
                "id": a.id,
                "user_id": a.user_id,
                "user_name": u.name if u else "Unknown",
                "action": a.action,
                "meta": a.meta,
                "created_at": a.created_at,
            }
        )
    return out
