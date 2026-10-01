from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Template = Literal["blank", "single_application", "scholarship_hunt"]
MemberRole = Literal["owner", "editor", "viewer"]
InviteRole = Literal["editor", "viewer"]


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    icon: str = "\U0001F4C1"
    template: Template = "blank"


class WorkspacePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    archived: bool | None = None


class MemberSummary(BaseModel):
    user_id: str
    name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class WorkspaceOut(BaseModel):
    id: str
    name: str
    description: str | None
    icon: str
    owner_id: str
    archived: bool
    created_at: datetime
    updated_at: datetime
    my_role: str
    member_count: int
    document_count: int
    opportunity_count: int = 0
    nearest_deadline: date | None = None
    last_activity_at: datetime | None = None
    members: list[dict] = []

    model_config = {"from_attributes": True}


class WorkspaceMemberOut(BaseModel):
    id: str
    user_id: str
    role: str
    name: str
    email: str

    model_config = {"from_attributes": True}


class MemberRolePatch(BaseModel):
    role: MemberRole


class InviteCreate(BaseModel):
    email: EmailStr
    role: InviteRole = "editor"


class InviteOut(BaseModel):
    id: str
    workspace_id: str
    email: str
    role: str
    token: str
    expires_at: datetime
    accepted_at: datetime | None
    invite_link: str

    model_config = {"from_attributes": True}


class InvitePreview(BaseModel):
    workspace_name: str
    workspace_icon: str
    role: str
    invited_by_name: str
    expired: bool
    already_accepted: bool


class DocumentCreate(BaseModel):
    type: Literal["sop", "cold_email", "checklist", "notes", "cover_letter"]
    title: str = Field(min_length=1, max_length=255)
    opportunity_id: str | None = None


class DocumentOut(BaseModel):
    id: str
    workspace_id: str
    type: str
    title: str
    content: str
    opportunity_id: str | None
    version: int
    updated_by: str | None
    updated_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentPatch(BaseModel):
    title: str | None = None
    content: str | None = None
    base_version: int = Field(description="Version the client last saw, for optimistic concurrency")


class DocumentVersionOut(BaseModel):
    version: int
    content: str
    edited_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityLogOut(BaseModel):
    id: str
    user_id: str
    user_name: str
    action: str
    meta: dict
    created_at: datetime

    model_config = {"from_attributes": True}
