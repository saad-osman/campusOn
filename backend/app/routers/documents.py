from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.document import Document, DocumentVersion
from app.models.user import User
from app.schemas.workspace import DocumentOut, DocumentPatch, DocumentVersionOut
from app.services.activity import log_activity
from app.services.workspace_access import require_document_role

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(doc: Document = Depends(require_document_role("viewer"))):
    return doc


@router.patch("/{document_id}", response_model=DocumentOut)
def patch_document(
    payload: DocumentPatch,
    doc: Document = Depends(require_document_role("editor")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.base_version != doc.version:
        # A teammate updated this document since the client last loaded it (Section 4.4).
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "message": "A teammate updated this document since you last loaded it.",
                "current": DocumentOut.model_validate(doc).model_dump(mode="json"),
            },
        )

    changed = False
    if payload.content is not None and payload.content != doc.content:
        db.add(
            DocumentVersion(
                document_id=doc.id, version=doc.version, content=doc.content, edited_by=doc.updated_by
            )
        )
        doc.content = payload.content
        doc.version += 1
        changed = True
    if payload.title is not None and payload.title != doc.title:
        doc.title = payload.title
        changed = True

    if changed:
        doc.updated_by = user.id
        log_activity(db, doc.workspace_id, user.id, "document_edited", {"document_id": doc.id, "title": doc.title})

    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{document_id}/versions", response_model=list[DocumentVersionOut])
def list_versions(
    doc: Document = Depends(require_document_role("viewer")),
    db: Session = Depends(get_db),
):
    return db.query(DocumentVersion).filter(DocumentVersion.document_id == doc.id).order_by(
        DocumentVersion.version.desc()
    ).all()


@router.post("/{document_id}/versions/{version}/restore", response_model=DocumentOut)
def restore_version(
    version: int,
    doc: Document = Depends(require_document_role("editor")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    snapshot = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == doc.id, DocumentVersion.version == version)
        .first()
    )
    if not snapshot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That version doesn't exist")

    db.add(DocumentVersion(document_id=doc.id, version=doc.version, content=doc.content, edited_by=doc.updated_by))
    doc.content = snapshot.content
    doc.version += 1
    doc.updated_by = user.id
    log_activity(db, doc.workspace_id, user.id, "document_restored", {"document_id": doc.id, "restored_version": version})
    db.commit()
    db.refresh(doc)
    return doc
