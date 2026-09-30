from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Entity


class TrackerItem(Entity):
    """Schema lands in Phase 2; the Kanban UI is wired up in Phase 5 (Feature 9)."""

    __tablename__ = "tracker_items"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    opportunity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # soft ref until Phase 3
    status: Mapped[str] = mapped_column(String(20), default="saved")  # saved|preparing|submitted|accepted|rejected
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class ActivityLog(Entity):
    __tablename__ = "activity_logs"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    user = relationship("User")
