from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Entity


class Source(Entity):
    __tablename__ = "sources"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    region: Mapped[str] = mapped_column(String(20), default="global")  # uae|gcc|global|india|europe|usa|asia
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_checked: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class RawPage(Entity):
    __tablename__ = "raw_pages"

    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    text_content: Mapped[str] = mapped_column(Text, default="")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
