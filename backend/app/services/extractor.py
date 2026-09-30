"""LLM-backed opportunity extraction with a rule-based fallback.

Runs through Claude (EXTRACTION_MODEL) when ANTHROPIC_API_KEY is set; otherwise
falls back to a regex/keyword extractor so the pipeline works end to end in
demo mode, at an honestly-lower confidence. See Section 5.1 for the eligibility
JSON schema and Section 7 for the scraping/extraction rules this follows
(strict JSON, retry once, then pending_review).
"""
import json
import re
from datetime import date
from typing import Literal

from dateutil import parser as dateparser
from pydantic import BaseModel, Field

from app.config import get_settings

settings = get_settings()

TYPE_KEYWORDS = [
    ("summer_school", ["summer school", "summer program", "summer undergraduate"]),
    ("research_internship", ["internship", "globalink", "surge"]),
    ("fellowship", ["fellowship"]),
    ("research_position", ["research assistantship", "phd position", "research position", "doctoral position"]),
    ("grant", ["grant", "travel award"]),
    ("scholarship", ["scholarship"]),
]

DEGREE_KEYWORDS = {
    "phd": ["phd", "doctoral", "doctorate"],
    "masters": ["master's", "masters", "msc", "graduate program"],
    "bachelors": ["bachelor", "undergraduate", "undergrad"],
    "postdoc": ["postdoc", "post-doctoral"],
}

FIELD_KEYWORDS = {
    "AI/ML": ["artificial intelligence", "machine learning", "robotics", "computer vision", " nlp", "deep learning"],
    "Computer Science": ["computer science", "software"],
    "Engineering": ["engineering"],
    "Data Science": ["data science", "analytics"],
    "Public Policy": ["public policy", "policy"],
    "Business": ["business", "mba", "management"],
    "Natural Sciences": ["physics", "chemistry", "biology", "natural sciences"],
    "Social Sciences": ["social sciences", "sociology", "psychology"],
    "Medicine": ["medicine", "medical", "health sciences"],
}

FUNDING_KEYWORDS = [
    ("fully_funded", ["fully funded", "full funding", "full tuition", "tuition waiver"]),
    ("partial", ["partial funding", "partial scholarship", "partial tuition"]),
    ("stipend", ["stipend"]),
    ("unfunded", ["unfunded", "self-funded", "self funded"]),
]

LOCATION_KEYWORDS = {
    "Germany": "europe", "United States": "usa", "USA": "usa", "UAE": "uae", "Abu Dhabi": "uae",
    "Dubai": "uae", "Saudi Arabia": "gcc", "Canada": "usa", "United Kingdom": "europe", "UK": "europe",
    "India": "india", "Qatar": "gcc", "Kuwait": "gcc", "Bahrain": "gcc", "Oman": "gcc",
}

DATE_PATTERN = re.compile(
    r"(deadline|apply by|closes on|closing date)[:\s]*"
    r"([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)
CGPA_PATTERN = re.compile(r"(?:cgpa|gpa)[^\d]{0,12}(\d\.\d{1,2})(?:\s*/\s*(\d))?", re.IGNORECASE)
IELTS_PATTERN = re.compile(r"ielts[^\d]{0,10}(\d\.\d)", re.IGNORECASE)
TOEFL_PATTERN = re.compile(r"toefl[^\d]{0,10}(\d{2,3})", re.IGNORECASE)
YEAR_PATTERN = re.compile(r"(\d)(?:st|nd|rd|th)?[\s-]*(?:year|yr)", re.IGNORECASE)


def _match_keywords(text_lower, table):
    return [label for label, kws in table.items() if any(kw in text_lower for kw in kws)]


def _match_priority(text_lower, table):
    for label, kws in table:
        if any(kw in text_lower for kw in kws):
            return label
    return None


def extract_rule_based(raw_text: str, source_name: str, source_url: str) -> dict:
    text_lower = f" {raw_text.lower()} "

    opp_type = _match_priority(text_lower, TYPE_KEYWORDS) or "scholarship"
    degree_levels = _match_keywords(text_lower, DEGREE_KEYWORDS) or ["any"]
    fields = _match_keywords(text_lower, FIELD_KEYWORDS) or ["General"]
    funding_type = _match_priority(text_lower, FUNDING_KEYWORDS) or "unknown"

    location_hits = [loc for loc in LOCATION_KEYWORDS if loc.lower() in text_lower]
    location = ", ".join(location_hits) if location_hits else None
    region_hits = {LOCATION_KEYWORDS[loc] for loc in location_hits}
    is_uae_region = "uae" in region_hits or "gcc" in region_hits
    open_to_uae_residents = None
    if is_uae_region:
        if "uae nationals only" in text_lower or "emirati nationals" in text_lower:
            open_to_uae_residents = False
        else:
            open_to_uae_residents = True

    date_match = DATE_PATTERN.search(raw_text)
    deadline = None
    deadline_text = None
    if date_match:
        deadline_text = date_match.group(2)
        try:
            deadline = dateparser.parse(deadline_text, fuzzy=True).date().isoformat()
        except Exception:
            deadline = None
    elif "rolling" in text_lower or "no fixed date" in text_lower:
        deadline_text = "Rolling / no fixed deadline"

    cgpa_match = CGPA_PATTERN.search(raw_text)
    min_cgpa = None
    if cgpa_match:
        value = float(cgpa_match.group(1))
        scale = float(cgpa_match.group(2)) if cgpa_match.group(2) else (4.0 if value <= 4.0 else 10.0)
        min_cgpa = {"value": value, "scale": scale}

    english_requirements = {}
    ielts_match = IELTS_PATTERN.search(raw_text)
    if ielts_match:
        english_requirements["IELTS"] = float(ielts_match.group(1))
    toefl_match = TOEFL_PATTERN.search(raw_text)
    if toefl_match:
        english_requirements["TOEFL"] = float(toefl_match.group(1))

    year_match = YEAR_PATTERN.search(raw_text)
    min_year = int(year_match.group(1)) if year_match else None

    funding_amount = None
    amount_match = re.search(r"(€|£|\$)[\d,]+(?:\s*(?:CAD|USD|EUR))?", raw_text)
    if amount_match:
        funding_amount = amount_match.group(0)

    lines = [l.strip() for l in raw_text.strip().splitlines() if l.strip()]
    title = lines[0] if lines else source_name
    organization = lines[1] if len(lines) > 1 else source_name

    eligibility = {
        "degree_levels": degree_levels,
        "min_year": min_year,
        "max_year": None,
        "min_cgpa": min_cgpa,
        "nationality_allowed": ["any"],
        "nationality_excluded": [],
        "residency_required": "UAE" if open_to_uae_residents is False else None,
        "english_requirements": english_requirements,
        "required_fields": [f for f in fields if f != "General"],
        "other_requirements": [],
    }

    fields_found = sum([
        bool(degree_levels != ["any"]), bool(fields != ["General"]), bool(location),
        bool(deadline or deadline_text), bool(min_cgpa), funding_type != "unknown",
    ])
    overall_confidence = round(0.30 + 0.55 * (fields_found / 6), 2)
    confidence = {
        "title": 0.6 if lines else 0.1,
        "organization": 0.6 if len(lines) > 1 else 0.1,
        "degree_levels": 0.8 if degree_levels != ["any"] else 0.2,
        "fields": 0.8 if fields != ["General"] else 0.2,
        "funding_type": 0.8 if funding_type != "unknown" else 0.2,
        "deadline": 0.8 if deadline else (0.4 if deadline_text else 0.1),
        "eligibility": 0.7 if (min_cgpa or english_requirements) else 0.3,
        "location": 0.8 if location else 0.1,
    }

    return {
        "title": title,
        "organization": organization,
        "url": source_url,
        "type": opp_type,
        "degree_levels": degree_levels,
        "fields": fields,
        "funding_type": funding_type,
        "funding_amount": funding_amount,
        "location": location,
        "is_remote": "remote" in text_lower,
        "open_to_uae_residents": open_to_uae_residents,
        "deadline": deadline,
        "deadline_text": deadline_text,
        "eligibility": eligibility,
        "description_summary": raw_text.strip()[:400],
        "confidence": confidence,
        "overall_confidence": overall_confidence,
        "source_name": source_name,
        "source_url": source_url,
    }


EXTRACTION_SCHEMA_PROMPT = """Extract structured research-opportunity data from this page text as JSON.
Return ONLY valid JSON (no markdown fences) with these exact keys:
title, organization, type (one of: research_internship, fellowship, grant, scholarship,
research_position, summer_school), degree_levels (array from: bachelors, masters, phd, postdoc, any),
fields (array of free-text field names), funding_type (one of: fully_funded, partial, stipend,
unfunded, unknown), funding_amount (string or null), location (string or null),
is_remote (bool), open_to_uae_residents (bool or null), deadline (ISO date YYYY-MM-DD or null),
deadline_text (string or null), eligibility (object: degree_levels, min_year, max_year,
min_cgpa {{value, scale}} or null, nationality_allowed, nationality_excluded,
residency_required, english_requirements {{IELTS, TOEFL}}, required_fields, other_requirements),
description_summary (1-2 sentences), confidence (object mapping each top-level field name to a
0-1 score), overall_confidence (0-1, your honest estimate of extraction completeness/reliability).

Source: {source_name} ({source_url})
Text:
{text}
"""


class _MinCgpa(BaseModel):
    value: float
    scale: float = 10.0


class _Eligibility(BaseModel):
    degree_levels: list[str] = Field(default_factory=list)
    min_year: int | None = None
    max_year: int | None = None
    min_cgpa: _MinCgpa | None = None
    nationality_allowed: list[str] = Field(default_factory=lambda: ["any"])
    nationality_excluded: list[str] = Field(default_factory=list)
    residency_required: str | None = None
    english_requirements: dict[str, float | None] = Field(default_factory=dict)
    required_fields: list[str] = Field(default_factory=list)
    other_requirements: list[str] = Field(default_factory=list)


class ExtractedOpportunity(BaseModel):
    """Strict shape the LLM must return (Section 7: validate with Pydantic)."""

    title: str = Field(min_length=1)
    organization: str = Field(min_length=1)
    type: Literal[
        "research_internship", "fellowship", "grant", "scholarship", "research_position", "summer_school"
    ]
    degree_levels: list[Literal["bachelors", "masters", "phd", "postdoc", "any"]]
    fields: list[str]
    funding_type: Literal["fully_funded", "partial", "stipend", "unfunded", "unknown"]
    funding_amount: str | None = None
    location: str | None = None
    is_remote: bool = False
    open_to_uae_residents: bool | None = None
    deadline: date | None = None
    deadline_text: str | None = None
    eligibility: _Eligibility
    description_summary: str | None = None
    confidence: dict[str, float] = Field(default_factory=dict)
    overall_confidence: float = Field(ge=0, le=1)


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            text = text.split("\n", 1)[1]
    return text


def extract_llm(raw_text: str, source_name: str, source_url: str) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def _call() -> dict:
        resp = client.messages.create(
            model=settings.EXTRACTION_MODEL,
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": EXTRACTION_SCHEMA_PROMPT.format(
                    source_name=source_name, source_url=source_url, text=raw_text[:6000]
                ),
            }],
        )
        text = _strip_fences(resp.content[0].text)
        validated = ExtractedOpportunity.model_validate(json.loads(text))
        data = validated.model_dump(mode="json")
        return data

    data = None
    for _attempt in range(2):  # retry once per Section 7
        try:
            data = _call()
            break
        except Exception:
            continue

    if data is None:
        # Both attempts failed validation: keep the best-effort rule-based fields
        # but force pending_review so a human checks it (Feature 6).
        data = extract_rule_based(raw_text, source_name, source_url)
        data["overall_confidence"] = 0.0
        data["extraction_error"] = "llm_output_invalid"

    data["url"] = source_url
    data["source_name"] = source_name
    data["source_url"] = source_url
    return data


def extract_opportunity(raw_text: str, source_name: str, source_url: str) -> tuple[dict, str]:
    if not settings.demo_mode_effective:
        return extract_llm(raw_text, source_name, source_url), "llm"
    return extract_rule_based(raw_text, source_name, source_url), "rule_based"
