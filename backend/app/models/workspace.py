from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Entity


class Workspace(Entity):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    icon: Mapped[str] = mapped_column(String(16), default="\U0001F4C1")  # folder emoji
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="workspace", cascade="all, delete-orphan")
    invites = relationship("Invite", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Entity):
    __tablename__ = "workspace_members"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # owner|editor|viewer

    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User")


class Invite(Entity):
    __tablename__ = "invites"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # editor|viewer
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    invited_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)

    workspace = relationship("Workspace", back_populates="invites")
