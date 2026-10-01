from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Entity


class Outcome(Entity):
    """A student's reported result for an application (Feature 9 -> Feature 13 analytics)."""

    __tablename__ = "outcomes"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id"), nullable=False)
    result: Mapped[str] = mapped_column(String(20), nullable=False)  # accepted|rejected|waitlisted
    reported_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    share_anonymously: Mapped[bool] = mapped_column(Boolean, default=False)
