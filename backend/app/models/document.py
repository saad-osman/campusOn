from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Entity


class Document(Entity):
    __tablename__ = "documents"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # sop|cold_email|checklist|notes|cover_letter
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    opportunity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # soft ref, opportunities land Phase 3
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    workspace = relationship("Workspace", back_populates="documents")
    versions = relationship(
        "DocumentVersion", back_populates="document", cascade="all, delete-orphan",
        order_by="DocumentVersion.version.desc()",
    )


class DocumentVersion(Entity):
    __tablename__ = "document_versions"

    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    edited_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    document = relationship("Document", back_populates="versions")
