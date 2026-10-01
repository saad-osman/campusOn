from typing import Literal

from pydantic import BaseModel, Field

Region = Literal["uae", "gcc", "global", "india", "europe", "usa", "asia"]
OppType = Literal["research_internship", "fellowship", "grant", "scholarship", "research_position", "summer_school"]


class SearchFilters(BaseModel):
    degree_level: Literal["bachelors", "masters", "phd"] | None = None
    year: int | None = Field(default=None, ge=1, le=10)
    fields: list[str] = Field(default_factory=list)
    funding: Literal["any", "funded", "fully_funded"] = "any"
    regions: list[Region] = Field(default_factory=list)
    types: list[OppType] = Field(default_factory=list)
    deadline_within_days: int | None = Field(default=None, ge=1, le=730)
    remote_only: bool = False
    open_to_uae_residents: bool | None = None
    eligible_only: bool = False
    verified_only: bool = False
    include_expired: bool = False
    semantic_query: str | None = None


class SearchRequest(BaseModel):
    """Either a raw `q` to interpret, or explicit `filters` (e.g. after the user
    removes a chip or changes the sidebar), which are used as-is."""

    q: str | None = Field(default=None, max_length=500)
    filters: SearchFilters | None = None
    sort: Literal["match", "deadline", "newest"] = "match"
