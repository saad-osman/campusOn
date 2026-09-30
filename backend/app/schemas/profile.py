from pydantic import BaseModel, Field


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
    onboarding_step: int
    onboarding_complete: bool

    model_config = {"from_attributes": True}


class ProfilePatch(BaseModel):
    degree_level: str | None = None
    year_of_study: int | None = None
    major: str | None = None
    cgpa: float | None = None
    cgpa_scale: float | None = None
    nationality: str | None = None
    country_of_residence: str | None = None
    english_tests: dict[str, float] | None = None
    skills: list[str] | None = None
    interests: list[str] | None = None
    onboarding_step: int | None = Field(default=None, ge=0)
    onboarding_complete: bool | None = None
