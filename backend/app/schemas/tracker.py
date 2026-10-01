from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

TrackerStatus = Literal["saved", "preparing", "submitted", "accepted", "rejected"]


class TrackerOpportunity(BaseModel):
    id: str
    title: str
    organization: str
    type: str
    deadline: date | None
    deadline_text: str | None
    status: str
    url: str | None
    eligibility_verdict: str | None
    match_score: int | None


class TrackerItemOut(BaseModel):
    id: str
    workspace_id: str
    opportunity_id: str | None
    status: TrackerStatus
    position: int
    notes: str | None
    assignee_id: str | None
    assignee_name: str | None
    updated_at: datetime
    opportunity: TrackerOpportunity | None


class TrackerItemCreate(BaseModel):
    opportunity_id: str
    status: TrackerStatus = "saved"
    notes: str | None = Field(default=None, max_length=2000)


class TrackerItemPatch(BaseModel):
    status: TrackerStatus | None = None
    position: int | None = Field(default=None, ge=0)
    assignee_id: str | None = None
    notes: str | None = Field(default=None, max_length=2000)


class TrackerReorder(BaseModel):
    columns: dict[TrackerStatus, list[str]]


class OutcomeCreate(BaseModel):
    opportunity_id: str
    result: Literal["accepted", "rejected", "waitlisted"]
    share_anonymously: bool = False
    workspace_id: str | None = None


class OutcomeOut(BaseModel):
    id: str
    opportunity_id: str
    result: str
    share_anonymously: bool
    reported_at: datetime

    model_config = {"from_attributes": True}
