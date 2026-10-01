from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Entity


class Endorsement(Entity):
    """Feature 12: a faculty member recommends an opportunity to a target audience."""

    __tablename__ = "endorsements"

    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id"), index=True, nullable=False)
    faculty_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_degree_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_major: Mapped[str | None] = mapped_column(String(255), nullable=True)
