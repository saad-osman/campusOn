from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Entity


class ProfessorOutreach(Entity):
    """A professor the student has emailed (Feature: outreach tracker). Display fields are
    copied from the professor finder, so the log still reads well if the search changes."""

    __tablename__ = "professor_outreach"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    professor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    affiliation: Mapped[str | None] = mapped_column(String(300), nullable=True)
    author_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Semantic Scholar id
    profile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    paper_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    opportunity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # soft ref
    opportunity_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="sent")  # sent | replied | closed
    sent_on: Mapped[date] = mapped_column(Date, nullable=False)
    follow_up_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    follow_ups: Mapped[int] = mapped_column(Integer, default=0)
    reminded_on: Mapped[date | None] = mapped_column(Date, nullable=True)  # last follow-up notification
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
