from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Entity


class Profile(Entity):
    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)

    degree_level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # bachelors|masters|phd
    year_of_study: Mapped[int | None] = mapped_column(Integer, nullable=True)
    major: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cgpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    cgpa_scale: Mapped[float] = mapped_column(Float, default=10.0)
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country_of_residence: Mapped[str | None] = mapped_column(String(100), nullable=True)
    english_tests: Mapped[dict] = mapped_column(JSON, default=dict)  # {"IELTS": 7.0}
    skills: Mapped[list] = mapped_column(JSON, default=list)
    interests: Mapped[list] = mapped_column(JSON, default=list)
    cv_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    cv_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)  # 384-dim float list

    onboarding_step: Mapped[int] = mapped_column(Integer, default=0)
    onboarding_complete: Mapped[bool] = mapped_column(default=False)

    user = relationship("User", back_populates="profile")
