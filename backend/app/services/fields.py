"""Fuzzy research-field matching ("does AI count as computer science?").

A synonym table handles the common cases deterministically; `fields_match`
optionally asks the LLM about pairs the table can't decide (Feature 1: "use
the LLM only to map fuzzy fields"). LLM answers are memoised per process.
"""
import logging
import re

from app.services.llm import LLMUnavailable, complete_json, llm_enabled

logger = logging.getLogger("scholarradar.fields")

# Canonical field label -> terms that count as that field. A requirement is
# met when any of the student's terms (major, interests, skills) hits one of
# the requirement's terms.
FIELD_GROUPS: dict[str, set[str]] = {
    "AI/ML": {
        "ai", "ai/ml", "artificial intelligence", "machine learning", "ml", "deep learning",
        "computer vision", "nlp", "natural language processing", "robotics", "reinforcement learning",
        "data science", "neural networks", "llm", "llms",
    },
    "Computer Science": {
        "computer science", "cs", "cse", "computing", "software", "software engineering",
        "computer engineering", "information technology", "it", "ai", "ai/ml", "artificial intelligence",
        "machine learning", "data science", "robotics", "computer vision", "nlp", "cybersecurity",
        "systems", "algorithms", "hci",
    },
    "Data Science": {
        "data science", "data analytics", "analytics", "statistics", "machine learning", "ml",
        "big data", "data engineering", "ai/ml",
    },
    "Engineering": {
        "engineering", "electrical", "electrical engineering", "electronics", "mechanical",
        "mechanical engineering", "civil", "chemical engineering", "computer engineering",
        "computer science", "robotics", "aerospace", "mechatronics", "instrumentation",
        "biomedical engineering", "eee", "ece",
    },
    "Public Policy": {
        "public policy", "policy", "economics", "political science", "governance",
        "international relations", "public administration", "development studies",
    },
    "Business": {"business", "management", "mba", "finance", "economics", "marketing", "entrepreneurship"},
    "Natural Sciences": {
        "natural sciences", "physics", "chemistry", "biology", "mathematics", "maths", "math",
        "biotechnology", "earth sciences", "environmental science", "life sciences",
    },
    "Social Sciences": {
        "social sciences", "sociology", "psychology", "anthropology", "economics",
        "political science", "linguistics",
    },
    "Medicine": {"medicine", "medical", "health", "health sciences", "biomedical", "pharmacy", "public health"},
}

# Terms that make a requirement effectively unrestricted.
OPEN_FIELDS = {"general", "any", "all fields", "all disciplines", "any discipline"}

_llm_cache: dict[tuple[str, str], bool] = {}


def norm(term: str) -> str:
    return re.sub(r"\s+", " ", (term or "").strip().lower())


def terms_for(field: str) -> set[str]:
    """A canonical label's group; for any other term, the union of every group
    that lists it ("ai" belongs to both AI/ML and Computer Science)."""
    n = norm(field)
    for label, group in FIELD_GROUPS.items():
        if n == norm(label):
            return group | {n}
    merged = {n}
    for label, group in FIELD_GROUPS.items():
        if n in group:
            merged |= group | {norm(label)}
    return merged


def _hits(student_term: str, field_terms: set[str]) -> bool:
    s = norm(student_term)
    if not s:
        return False
    if s in field_terms:
        return True
    # Multi-word containment: "machine learning for robotics" hits "robotics".
    return any(len(t) > 3 and (t in s or s in t) for t in field_terms)


def match_field_deterministic(field: str, student_terms: list[str]) -> str | None:
    """Returns the student term that satisfies `field`, or None."""
    if norm(field) in OPEN_FIELDS:
        return "any"
    field_terms = terms_for(field)
    for term in student_terms:
        if _hits(term, field_terms):
            return term
    return None


def _llm_match(field: str, student_terms: list[str]) -> bool:
    key = (norm(field), "|".join(sorted(norm(t) for t in student_terms)))
    if key in _llm_cache:
        return _llm_cache[key]
    try:
        data = complete_json(
            "You decide whether a student's academic background fits a research opportunity's "
            "required field. Answer only with JSON: {\"match\": true|false}.",
            f"Required field: {field}\nStudent's major, interests and skills: {', '.join(student_terms)}\n"
            "Would a reasonable admissions reviewer consider this student to be in, or closely "
            "adjacent to, the required field?",
            max_tokens=50,
        )
        result = bool(data.get("match"))
    except LLMUnavailable:
        return False
    _llm_cache[key] = result
    return result


def fields_match(field: str, student_terms: list[str], allow_llm: bool = False) -> str | None:
    hit = match_field_deterministic(field, student_terms)
    if hit or not allow_llm or not llm_enabled() or not student_terms:
        return hit
    return "related background" if _llm_match(field, student_terms) else None
