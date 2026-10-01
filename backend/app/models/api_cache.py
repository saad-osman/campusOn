from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Entity


class ApiCache(Entity):
    """Cached external API responses (Semantic Scholar lookups are kept 7 days)."""

    __tablename__ = "api_cache"

    key: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    namespace: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
