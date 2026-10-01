from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ProfileOut(BaseModel):
    degree_level: str | None
    year_of_study: int | None
    major: str | None
    cgpa: float | None
    cgpa_scale: float
    nationality: str | None
    country_of_residence: str | None
    english_tests: dict[str, float]
    skills: list[str]
    interests: list[str]
    cv_filename: str | None
    has_cv: bool = False
    onboarding_step: int
    onboarding_complete: bool

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _has_cv(cls, data):
        if not isinstance(data, dict):
            data = {k: getattr(data, k) for k in cls.model_fields if k != "has_cv" and hasattr(data, k)} | {
                "has_cv": bool(getattr(data, "cv_text", None))
            }
        return data


class ProfilePatch(BaseModel):
    degree_level: Literal["bachelors", "masters", "phd"] | None = None
    year_of_study: int | None = Field(default=None, ge=1, le=10)
    major: str | None = None
    cgpa: float | None = Field(default=None, ge=0, le=10)
    cgpa_scale: float | None = Field(default=None, gt=0, le=10)
    nationality: str | None = None
    country_of_residence: str | None = None
    english_tests: dict[str, float] | None = None
    skills: list[str] | None = None
    interests: list[str] | None = None
    onboarding_step: int | None = Field(default=None, ge=0)
    onboarding_complete: bool | None = None


class CVExtractionOut(BaseModel):
    cv_filename: str | None
    suggestions: dict
    method: str  # "llm" or "rule_based"
    characters: int
