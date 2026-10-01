"""Feature 4: generate an application kit (or a single AI draft) into an Application File."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.document import Document
from app.models.opportunity import Opportunity
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.routers.tracker import add_to_tracker
from app.schemas.workspace import DocumentOut
from app.services import copilot
from app.services.activity import log_activity
from app.services.opportunity_view import get_profile, visible_to
from app.services.workspace_access import ROLE_RANK

router = APIRouter(prefix="/api/copilot", tags=["copilot"])

DocType = Literal["sop", "cold_email", "checklist", "cover_letter", "notes"]
TITLES = {
    "sop": "Statement of Purpose", "cold_email": "Cold email", "checklist": "Application checklist",
    "cover_letter": "Cover letter", "notes": "Notes",
}


class ProfessorRef(BaseModel):
    name: str = Field(max_length=200)
    affiliation: str | None = Field(default=None, max_length=300)
    paper_title: str | None = Field(default=None, max_length=500)
    paper_year: int | None = None


class KitRequest(BaseModel):
    opportunity_id: str
    workspace_id: str | None = None  # omitted -> a new Application File is created
    include: list[Literal["checklist", "sop", "cold_email"]] = ["checklist", "sop", "cold_email"]
    professor: ProfessorRef | None = None


class DraftRequest(BaseModel):
    workspace_id: str
    type: DocType
    title: str | None = Field(default=None, max_length=255)
    opportunity_id: str | None = None
    professor: ProfessorRef | None = None


class KitResponse(BaseModel):
    workspace_id: str
    workspace_name: str
    documents: list[DocumentOut]
    method: str  # llm | template | mixed


def _require_editor(db: Session, workspace_id: str, user: User) -> Workspace:
    m = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id)
        .first()
    )
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application File not found")
    if ROLE_RANK[m.role] < ROLE_RANK["editor"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Viewers can't add documents")
    return db.get(Workspace, workspace_id)


def _opportunity(db: Session, user: User, opportunity_id: str | None) -> Opportunity | None:
    if not opportunity_id:
        return None
    opp = db.get(Opportunity, opportunity_id)
    if not opp or not visible_to(user, opp):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    return opp


def _make_doc(db: Session, ws: Workspace, user: User, doc_type: str, opp: Opportunity | None,
              professor: ProfessorRef | None, title: str | None = None) -> tuple[Document, str]:
    profile = get_profile(db, user)
    content, method = copilot.generate(doc_type, user, profile, opp, professor.model_dump() if professor else None)
    if not title:
        suffix = professor.name.split(" (")[0] if (doc_type == "cold_email" and professor) else (opp.title if opp else "")
        title = f"{TITLES[doc_type]}: {suffix}" if suffix else TITLES[doc_type]
    doc = Document(workspace_id=ws.id, type=doc_type, title=title[:255], content=content,
                   opportunity_id=opp.id if opp else None, updated_by=user.id)
    db.add(doc)
    log_activity(db, ws.id, user.id, "ai_draft_created", {"title": doc.title, "type": doc_type})
    return doc, method


@router.post("/kit", response_model=KitResponse, status_code=status.HTTP_201_CREATED)
def generate_kit(payload: KitRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    opp = _opportunity(db, user, payload.opportunity_id)
    if payload.workspace_id:
        ws = _require_editor(db, payload.workspace_id, user)
    else:
        ws = Workspace(name=opp.title[:255], description=f"Application for {opp.organization}", icon="🎯", owner_id=user.id)
        db.add(ws)
        db.flush()
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="owner"))
        log_activity(db, ws.id, user.id, "workspace_created", {"name": ws.name, "template": "application_kit"})

    item, _ = add_to_tracker(db, ws.id, opp, user, status_="preparing")
    if item.status == "saved":
        item.status = "preparing"

    docs, methods = [], set()
    for doc_type in dict.fromkeys(payload.include):  # de-duplicate, keep order
        doc, method = _make_doc(db, ws, user, doc_type, opp, payload.professor)
        docs.append(doc)
        methods.add(method)
    log_activity(db, ws.id, user.id, "kit_generated", {"title": opp.title, "documents": len(docs)})
    ws.updated_at = datetime.utcnow()
    db.commit()
    for d in docs:
        db.refresh(d)
    method = "llm" if methods == {"llm"} else ("template" if "llm" not in methods else "mixed")
    return {"workspace_id": ws.id, "workspace_name": ws.name, "documents": docs, "method": method}


@router.post("/draft", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def generate_draft(payload: DraftRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _require_editor(db, payload.workspace_id, user)
    opp = _opportunity(db, user, payload.opportunity_id)
    doc, _ = _make_doc(db, ws, user, payload.type, opp, payload.professor, payload.title)
    ws.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return doc
