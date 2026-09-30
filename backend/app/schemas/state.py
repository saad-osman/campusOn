from typing import Any

from pydantic import BaseModel


class UserStateOut(BaseModel):
    last_route: str | None
    last_workspace_id: str | None
    last_document_id: str | None
    ui_state: dict[str, Any]

    model_config = {"from_attributes": True}


class UserStatePatch(BaseModel):
    last_route: str | None = None
    last_workspace_id: str | None = None
    last_document_id: str | None = None
    ui_state: dict[str, Any] | None = None
