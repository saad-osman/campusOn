"""Feature 9: the Application File tracker (Kanban) and outcome reporting."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.opportunity import Opportunity, SavedOpportunity
from app.models.outcome import Outcome
from app.models.tracker import TrackerItem
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.tracker import (
    OutcomeCreate,
    OutcomeOut,
    TrackerItemCreate,
    TrackerItemOut,
    TrackerItemPatch,
    TrackerReorder,
)
from app.services.activity import log_activity
from app.services.notifications import notify
from app.services.opportunity_view import build_payloads, visible_to
from app.services.workspace_access import ROLE_RANK, require_workspace_role

router = APIRouter(tags=["tracker"])

STATUSES = ["saved", "preparing", "submitted", "accepted", "rejected"]


def _member_role(db: Session, workspace_id: str, user_id: str) -> str | None:
    m = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id)
        .first()
    )
    return m.role if m else None


def _item_for_editor(db: Session, item_id: str, user: User) -> TrackerItem:
    item = db.get(TrackerItem, item_id)
    role = _member_role(db, item.workspace_id, user.id) if item else None
    if not item or role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tracker card not found")
    if ROLE_RANK[role] < ROLE_RANK["editor"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Viewers can't change the tracker")
    return item


def serialize_items(db: Session, items: list[TrackerItem], user: User) -> list[dict]:
    opp_ids = [i.opportunity_id for i in items if i.opportunity_id]
    opps = db.query(Opportunity).filter(Opportunity.id.in_(opp_ids)).all() if opp_ids else []
    payloads = {p["id"]: p for p in build_payloads(db, opps, user)}
    user_ids = {i.assignee_id for i in items if i.assignee_id}
    names = {u.id: u.name for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    out = []
    for i in items:
        p = payloads.get(i.opportunity_id)
        out.append({
            "id": i.id, "workspace_id": i.workspace_id, "opportunity_id": i.opportunity_id,
            "status": i.status, "position": i.position, "notes": i.notes,
            "assignee_id": i.assignee_id, "assignee_name": names.get(i.assignee_id),
            "updated_at": i.updated_at,
            "opportunity": {
                "id": p["id"], "title": p["title"], "organization": p["organization"], "type": p["type"],
                "deadline": p["deadline"], "deadline_text": p["deadline_text"], "status": p["status"],
                "url": p["url"],
                "eligibility_verdict": (p.get("eligibility_check") or {}).get("verdict"),
                "match_score": (p.get("match") or {}).get("score"),
            } if p else None,
        })
    out.sort(key=lambda x: (STATUSES.index(x["status"]) if x["status"] in STATUSES else 99, x["position"]))
    return out


@router.get("/api/workspaces/{workspace_id}/tracker", response_model=list[TrackerItemOut])
def list_tracker(
    workspace_id: str,
    _: WorkspaceMember = Depends(require_workspace_role("viewer")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(TrackerItem).filter(TrackerItem.workspace_id == workspace_id).all()
    return serialize_items(db, items, user)


def add_to_tracker(db: Session, workspace_id: str, opp: Opportunity, user: User,
                   status_: str = "saved", notes: str | None = None) -> tuple[TrackerItem, bool]:
    """Adds `opp` to the file's tracker unless it's already there. Returns (item, created)."""
    existing = (
        db.query(TrackerItem)
        .filter(TrackerItem.workspace_id == workspace_id, TrackerItem.opportunity_id == opp.id)
        .first()
    )
    if existing:
        return existing, False
    last = (
        db.query(TrackerItem)
        .filter(TrackerItem.workspace_id == workspace_id, TrackerItem.status == status_)
        .order_by(TrackerItem.position.desc())
        .first()
    )
    item = TrackerItem(
        workspace_id=workspace_id, opportunity_id=opp.id, status=status_, notes=notes,
        position=(last.position + 1) if last else 0,
    )
    db.add(item)
    # Tracking implies interest: save it too, so change alerts reach this student (Feature 5).
    if not db.query(SavedOpportunity).filter(
        SavedOpportunity.user_id == user.id, SavedOpportunity.opportunity_id == opp.id
    ).first():
        db.add(SavedOpportunity(user_id=user.id, opportunity_id=opp.id))
    log_activity(db, workspace_id, user.id, "tracker_added", {"title": opp.title, "opportunity_id": opp.id})
    return item, True


@router.post("/api/workspaces/{workspace_id}/tracker", response_model=TrackerItemOut,
             status_code=status.HTTP_201_CREATED)
def create_tracker_item(
    workspace_id: str,
    payload: TrackerItemCreate,
    _: WorkspaceMember = Depends(require_workspace_role("editor")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    opp = db.get(Opportunity, payload.opportunity_id)
    if not opp or not visible_to(user, opp):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    item, created = add_to_tracker(db, workspace_id, opp, user, payload.status, payload.notes)
    if not created:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already in this Application File's tracker")
    db.get(Workspace, workspace_id).updated_at = datetime.utcnow()  # "last activity" on /files
    db.commit()
    db.refresh(item)
    return serialize_items(db, [item], user)[0]


@router.patch("/api/tracker/{item_id}", response_model=TrackerItemOut)
def patch_tracker_item(
    item_id: str,
    payload: TrackerItemPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = _item_for_editor(db, item_id, user)
    opp = db.get(Opportunity, item.opportunity_id) if item.opportunity_id else None
    title = opp.title if opp else "a card"
    changes = payload.model_dump(exclude_unset=True)

    if changes.get("status") and changes["status"] != item.status:
        item.status = changes["status"]
        log_activity(db, item.workspace_id, user.id, "tracker_moved", {"title": title, "status": item.status})
    if changes.get("position") is not None:
        item.position = changes["position"]
    if "notes" in changes:
        item.notes = changes["notes"]
    if "assignee_id" in changes and changes["assignee_id"] != item.assignee_id:
        assignee_id = changes["assignee_id"]
        if assignee_id is not None:
            if _member_role(db, item.workspace_id, assignee_id) is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assignee must be a member of this Application File")
            assignee = db.get(User, assignee_id)
            log_activity(db, item.workspace_id, user.id, "tracker_assigned",
                         {"title": title, "assignee_name": assignee.name})
            if assignee_id != user.id:
                ws = db.get(Workspace, item.workspace_id)
                notify(db, assignee_id, "assignment", f"{user.name} assigned you “{title}”",
                       f"In {ws.name}.", f"/files/{item.workspace_id}?tab=tracker")
        item.assignee_id = assignee_id
    db.commit()
    db.refresh(item)
    return serialize_items(db, [item], user)[0]


@router.post("/api/workspaces/{workspace_id}/tracker/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_tracker(
    workspace_id: str,
    payload: TrackerReorder,
    _: WorkspaceMember = Depends(require_workspace_role("editor")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persists the board after a drag: each column's card ids in display order."""
    items = {i.id: i for i in db.query(TrackerItem).filter(TrackerItem.workspace_id == workspace_id).all()}
    for column, ids in payload.columns.items():
        for position, item_id in enumerate(ids):
            item = items.get(item_id)
            if not item:
                continue
            if item.status != column:
                opp = db.get(Opportunity, item.opportunity_id) if item.opportunity_id else None
                log_activity(db, workspace_id, user.id, "tracker_moved",
                             {"title": opp.title if opp else "a card", "status": column})
                item.status = column
            item.position = position
    db.commit()
    return None


@router.delete("/api/tracker/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tracker_item(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = _item_for_editor(db, item_id, user)
    opp = db.get(Opportunity, item.opportunity_id) if item.opportunity_id else None
    log_activity(db, item.workspace_id, user.id, "tracker_removed", {"title": opp.title if opp else "a card"})
    db.delete(item)
    db.commit()
    return None


@router.post("/api/outcomes", response_model=OutcomeOut, status_code=status.HTTP_201_CREATED)
def record_outcome(payload: OutcomeCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    opp = db.get(Opportunity, payload.opportunity_id)
    if not opp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    outcome = (
        db.query(Outcome)
        .filter(Outcome.user_id == user.id, Outcome.opportunity_id == opp.id)
        .first()
    )
    if outcome:
        outcome.result = payload.result
        outcome.share_anonymously = payload.share_anonymously
    else:
        outcome = Outcome(user_id=user.id, opportunity_id=opp.id, result=payload.result,
                          share_anonymously=payload.share_anonymously)
        db.add(outcome)
    if payload.workspace_id and _member_role(db, payload.workspace_id, user.id):
        log_activity(db, payload.workspace_id, user.id, "outcome_recorded", {"title": opp.title, "result": payload.result})
    db.commit()
    db.refresh(outcome)
    return outcome


@router.get("/api/outcomes/mine", response_model=list[OutcomeOut])
def my_outcomes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Outcome).filter(Outcome.user_id == user.id).order_by(Outcome.reported_at.desc()).all()
