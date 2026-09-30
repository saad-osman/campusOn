from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.document import Document
from app.models.user import User
from app.models.workspace import WorkspaceMember

ROLE_RANK = {"viewer": 0, "editor": 1, "owner": 2}


def require_workspace_role(min_role: str = "viewer"):
    def _check(
        workspace_id: str,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WorkspaceMember:
        member = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id)
            .first()
        )
        if not member:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Application File not found")
        if ROLE_RANK[member.role] < ROLE_RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions for this Application File")
        return member

    return _check


def require_document_role(min_role: str = "viewer"):
    def _check(
        document_id: str,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Document:
        doc = db.get(Document, document_id)
        if not doc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
        member = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == doc.workspace_id, WorkspaceMember.user_id == user.id)
            .first()
        )
        if not member:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
        if ROLE_RANK[member.role] < ROLE_RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions for this document")
        return doc

    return _check
