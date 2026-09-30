from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Entity


class UserState(Entity):
    """Soft references to workspace/document (no FK) since those tables land in Phase 2."""

    __tablename__ = "user_states"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    last_route: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_workspace_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_document_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    ui_state: Mapped[dict] = mapped_column(JSON, default=dict)

    user = relationship("User", back_populates="user_state")
