from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class LinkedSource(BaseModel):
    name: str
    url: str
    region: str


class OpportunityOut(BaseModel):
    id: str
    canonical_id: str | None
    title: str
    organization: str
    url: str | None
    type: str
    degree_levels: list[str]
    fields: list[str]
    funding_type: str
    funding_amount: str | None
    location: str | None
    is_remote: bool
    open_to_uae_residents: bool | None
    deadline: date | None
    deadline_text: str | None
    eligibility: dict
    description_summary: str | None
    confidence: dict
    overall_confidence: float
    verified: bool
    status: str
    first_seen: datetime
    last_checked: datetime
    source_count: int = 1
    sources: list[LinkedSource] = []
    saved: bool = False

    model_config = {"from_attributes": True}


class SourceCreate(BaseModel):
    name: str
    base_url: str
    region: Literal["uae", "gcc", "global", "india", "europe", "usa", "asia"] = "global"
    notes: str | None = None


class SourcePatch(BaseModel):
    active: bool | None = None
    name: str | None = None
    notes: str | None = None


class SourceOut(BaseModel):
    id: str
    name: str
    base_url: str
    region: str
    active: bool
    last_checked: datetime | None
    last_status: str | None
    notes: str | None

    model_config = {"from_attributes": True}


class ScrapeRunOut(BaseModel):
    id: str
    source_id: str | None
    status: str
    pages_fetched: int
    new_count: int
    updated_count: int
    merged_count: int
    failed_count: int
    started_at: datetime
    finished_at: datetime | None
    detail: dict

    model_config = {"from_attributes": True}


class OpportunityChangeOut(BaseModel):
    field: str
    old_value: str | None
    new_value: str | None
    summary: str | None
    detected_at: datetime

    model_config = {"from_attributes": True}
