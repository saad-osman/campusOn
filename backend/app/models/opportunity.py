from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Entity


class Opportunity(Entity):
    __tablename__ = "opportunities"

    # Self-reference: null on the canonical row; set to the canonical row's id
    # on a row that was identified as a duplicate (Feature 7).
    canonical_id: Mapped[str | None] = mapped_column(ForeignKey("opportunities.id"), nullable=True)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    organization: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    type: Mapped[str] = mapped_column(String(30), default="research_internship")
    # research_internship|fellowship|grant|scholarship|research_position|summer_school
    degree_levels: Mapped[list] = mapped_column(JSON, default=list)  # ["bachelors","masters",...]
    fields: Mapped[list] = mapped_column(JSON, default=list)
    funding_type: Mapped[str] = mapped_column(String(20), default="unknown")
    # fully_funded|partial|stipend|unfunded|unknown
    funding_amount: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False)
    open_to_uae_residents: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline_text: Mapped[str | None] = mapped_column(String(255), nullable=True)

    eligibility: Mapped[dict] = mapped_column(JSON, default=dict)  # schema in spec Section 5.1
    description_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[dict] = mapped_column(JSON, default=dict)  # per-field 0-1
    overall_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending_review")
    # active|expired|broken|pending_review

    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)  # 384-dim float list

    first_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_checked: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    broken_count: Mapped[int] = mapped_column(default=0)


class OpportunitySource(Entity):
    __tablename__ = "opportunity_sources"

    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id"), nullable=False)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)


class OpportunityChange(Entity):
    __tablename__ = "opportunity_changes"

    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id"), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Plain-language line shown in the change-history timeline and used for alerts,
    # e.g. "Deadline extended: 1 Nov 2027 → 15 Nov 2027".
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SavedOpportunity(Entity):
    __tablename__ = "saved_opportunities"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id"), nullable=False)
