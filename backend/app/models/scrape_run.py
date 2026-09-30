from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Entity


class ScrapeRun(Entity):
    """One row per scraper invocation, shown on the admin page (Section 7: 'Log every run')."""

    __tablename__ = "scrape_runs"

    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running|ok|failed
    pages_fetched: Mapped[int] = mapped_column(Integer, default=0)
    new_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    merged_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
