"""Eligibility fix plan (services/fix_plan.py): read it, or add its steps to an Application File."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.document import Document, DocumentVersion
from app.models.opportunity import Opportunity
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.routers.copilot import _require_editor
from app.routers.tracker import add_to_tracker
from app.services.activity import log_activity
from app.services.fix_plan import build_fix_plan, checklist_line
from app.services.matcher import profile_to_dict
from app.services.opportunity_view import get_profile, visible_to

router = APIRouter(prefix="/api/opportunities", tags=["fix-plan"])


class FixStepOut(BaseModel):
    key: str
    kind: str  # profile | action | blocked
    title: str
    detail: str | None = None
    due: date | None = None
    urgent: bool = False
    link: str | None = None


class FixPlanOut(BaseModel):
    verdict: str
    deadline: date | None
    has_deadline: bool
    blocked: bool
    steps: list[FixStepOut]


class ApplyFixPlanIn(BaseModel):
    workspace_id: str | None = None  # None: create a new Application File for this opportunity


class ApplyFixPlanOut(BaseModel):
    workspace_id: str
    workspace_name: str
    document_id: str
    added: int


def _plan(db: Session, user: User, opportunity_id: str) -> tuple[Opportunity, dict]:
    opp = db.get(Opportunity, opportunity_id)
    if not opp or not visible_to(user, opp):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    return opp, build_fix_plan(profile_to_dict(get_profile(db, user)), opp)


@router.get("/{opportunity_id}/fix-plan", response_model=FixPlanOut)
def get_fix_plan(opportunity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _plan(db, user, opportunity_id)[1]


@router.post("/{opportunity_id}/fix-plan/apply", response_model=ApplyFixPlanOut)
def apply_fix_plan(opportunity_id: str, payload: ApplyFixPlanIn,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Appends the plan's dated steps to the File's checklist for this opportunity (creating the
    checklist, or the File, if needed) and puts the opportunity in the File's tracker."""
    opp, plan = _plan(db, user, opportunity_id)
    todo = [s for s in plan["steps"] if s["kind"] != "blocked"]
    if not todo:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to add: this plan has no steps you can act on")

    if payload.workspace_id:
        ws = _require_editor(db, payload.workspace_id, user)
    else:
        ws = Workspace(name=opp.title[:255], description=f"Application for {opp.organization}", icon="🎯", owner_id=user.id)
        db.add(ws)
        db.flush()
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="owner"))
        log_activity(db, ws.id, user.id, "workspace_created", {"name": ws.name, "template": "fix_plan"})
    add_to_tracker(db, ws.id, opp, user)

    doc = (
        db.query(Document)
        .filter(Document.workspace_id == ws.id, Document.type == "checklist", Document.opportunity_id == opp.id)
        .order_by(Document.created_at)
        .first()
    )
    if not doc:
        doc = Document(workspace_id=ws.id, type="checklist", title=f"Eligibility plan: {opp.title}"[:255],
                       content=f"# Eligibility plan: {opp.title}\n", opportunity_id=opp.id, updated_by=user.id)
        db.add(doc)
        db.flush()

    existing = doc.content or ""
    new_lines = [checklist_line(s) for s in todo if s["title"] not in existing]  # don't repeat a step
    if new_lines:
        if existing.strip():  # keep the previous text in the version history, like any edit
            db.add(DocumentVersion(document_id=doc.id, version=doc.version, content=existing, edited_by=doc.updated_by))
        doc.content = existing.rstrip("\n") + "\n\n" + "\n".join(new_lines) + "\n"
        doc.version = (doc.version or 1) + 1
        doc.updated_by = user.id
    log_activity(db, ws.id, user.id, "fix_plan_added", {"title": opp.title, "steps": len(new_lines)})
    ws.updated_at = datetime.utcnow()
    db.commit()
    return {"workspace_id": ws.id, "workspace_name": ws.name, "document_id": doc.id, "added": len(new_lines)}
