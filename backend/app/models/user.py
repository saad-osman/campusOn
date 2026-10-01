from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Entity


class User(Entity):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="student")
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # One-time code shown in Settings; the Telegram bot's /start <code> links the chat (Feature 10).
    telegram_link_code: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    telegram_link_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # {"email_digest": bool, "telegram_digest": bool, "change_alerts": bool, "endorsements": bool}
    notification_prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    last_digest_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    profile = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    user_state = relationship("UserState", back_populates="user", uselist=False, cascade="all, delete-orphan")
