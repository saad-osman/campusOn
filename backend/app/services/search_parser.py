"""Feature 8: turn a free-text query into structured filters + a semantic query.

"funded summer AI internships in Europe for 3rd year undergrads" ->
  degree_level=bachelors, year=3, fields=[AI/ML], funding=funded,
  regions=[europe], types=[research_internship], semantic_query="summer AI internships"

Uses EXTRACTION_MODEL when an API key is set, with this rule-based parser as
the demo-mode path and the fallback if the model call fails.
"""
import re

from app.schemas.search import SearchFilters
from app.services.llm import LLMUnavailable, complete_json, llm_enabled

DEGREE_PATTERNS = [
    ("phd", r"\b(phd|ph\.d|doctoral|doctorate)\b"),
    ("masters", r"\b(masters?|master's|msc|m\.sc|mtech|m\.tech|postgrad(uate)?s?)\b"),
    ("bachelors", r"\b(undergrads?|undergraduates?|bachelors?|bachelor's|btech|b\.tech|b\.e)\b"),
]
YEAR_PATTERN = re.compile(r"\b([1-5])(?:st|nd|rd|th)[\s-]*year\b|\byear\s*([1-5])\b", re.I)

TYPE_PATTERNS = [
    ("summer_school", r"\bsummer schools?\b"),
    ("research_internship", r"\b(internships?|interns?)\b"),
    ("fellowship", r"\bfellowships?\b"),
    ("scholarship", r"\bscholarships?\b"),
    ("grant", r"\b(grants?|travel awards?)\b"),
    ("research_position", r"\b(research positions?|research assistant(ship)?s?|ra positions?|phd positions?)\b"),
]

REGION_PATTERNS = [
    ("uae", r"\b(uae|emirates|dubai|abu dhabi|sharjah)\b"),
    ("gcc", r"\b(gcc|gulf|middle east|saudi|ksa|qatar|kuwait|bahrain|oman)\b"),
    ("europe", r"\b(europe|european|eu|germany|uk|united kingdom|france|netherlands|switzerland|sweden|italy|spain)\b"),
    ("usa", r"\b(usa|us|u\.s\.|america|united states|canada|north america)\b"),
    ("india", r"\b(india|indian)\b"),
    ("asia", r"\b(asia|singapore|japan|korea|china|hong kong|taiwan)\b"),
]

FIELD_PATTERNS = [
    ("AI/ML", r"\b(ai|a\.i\.|artificial intelligence|machine learning|ml|deep learning|nlp|computer vision|robotics)\b"),
    ("Computer Science", r"\b(computer science|cs|software|computing)\b"),
    ("Data Science", r"\b(data science|analytics|statistics)\b"),
    ("Engineering", r"\b(engineering|electrical|mechanical|electronics)\b"),
    ("Public Policy", r"\b(public policy|policy|governance)\b"),
    ("Business", r"\b(business|management|mba|finance)\b"),
    ("Natural Sciences", r"\b(physics|chemistry|biology|mathematics|natural sciences)\b"),
    ("Social Sciences", r"\b(social sciences?|sociology|psychology|economics)\b"),
    ("Medicine", r"\b(medicine|medical|health)\b"),
]

FUNDING_PATTERNS = [
    ("fully_funded", r"\b(fully[\s-]funded|full funding|full scholarship)\b"),
    ("funded", r"\b(funded|paid|stipends?|with funding)\b"),
]

DEADLINE_PATTERNS = [
    (7, r"\b(this week|next 7 days|closing soon|urgent)\b"),
    (30, r"\b(this month|next 30 days|next month)\b"),
]

FILLER = re.compile(
    r"\b(for|in|at|the|a|an|of|to|and|or|with|students?|open|opportunities|programs?|show|me|find|"
    r"looking|i'm|im|i|am|any|that|are|is)\b",
    re.I,
)


def parse_query_rule_based(q: str) -> SearchFilters:
    text = q.strip()
    lower = text.lower()
    f = SearchFilters()
    consumed: list[str] = []

    for value, pattern in DEGREE_PATTERNS:
        m = re.search(pattern, lower)
        if m:
            f.degree_level = value
            consumed.append(m.group(0))
            break
    m = YEAR_PATTERN.search(lower)
    if m:
        f.year = int(m.group(1) or m.group(2))
        consumed.append(m.group(0))

    for value, pattern in TYPE_PATTERNS:
        m = re.search(pattern, lower)
        if m:
            f.types.append(value)
            if value != "research_internship":  # keep "internship" in the semantic text
                consumed.append(m.group(0))

    for value, pattern in REGION_PATTERNS:
        m = re.search(pattern, lower)
        if m:
            f.regions.append(value)
            consumed.append(m.group(0))
    if re.search(r"\bremote\b", lower):
        f.remote_only = True
        consumed.append("remote")
    if re.search(r"\b(open to uae residents|uae residents?)\b", lower):
        f.open_to_uae_residents = True

    for value, pattern in FIELD_PATTERNS:
        if re.search(pattern, lower):
            f.fields.append(value)

    for value, pattern in FUNDING_PATTERNS:
        m = re.search(pattern, lower)
        if m:
            f.funding = value
            consumed.append(m.group(0))
            break

    for days, pattern in DEADLINE_PATTERNS:
        m = re.search(pattern, lower)
        if m:
            f.deadline_within_days = days
            consumed.append(m.group(0))
            break

    semantic = lower
    for c in sorted(consumed, key=len, reverse=True):
        semantic = semantic.replace(c, " ")
    semantic = FILLER.sub(" ", semantic)
    semantic = re.sub(r"[^\w\s/+-]", " ", semantic)
    f.semantic_query = re.sub(r"\s+", " ", semantic).strip() or None
    return f


SYSTEM = (
    "You convert a student's search for research opportunities into structured filters. "
    "Return only a JSON object with these keys (omit nothing; use null or [] when not stated): "
    "degree_level (bachelors|masters|phd|null), year (integer year of study or null), "
    "fields (array, values only from: AI/ML, Computer Science, Data Science, Engineering, Public Policy, "
    "Business, Natural Sciences, Social Sciences, Medicine), "
    "funding (any|funded|fully_funded), regions (array from: uae, gcc, europe, usa, india, asia), "
    "types (array from: research_internship, fellowship, grant, scholarship, research_position, summer_school), "
    "deadline_within_days (integer or null), remote_only (bool), open_to_uae_residents (bool or null), "
    "semantic_query (the topical words left over, e.g. 'summer robotics internships', or null). "
    "Only set a filter when the query clearly asks for it."
)


def parse_query(q: str) -> tuple[SearchFilters, str]:
    if llm_enabled():
        try:
            data = complete_json(SYSTEM, f"Query: {q}", max_tokens=400)
            data = {k: v for k, v in data.items() if v is not None and k in SearchFilters.model_fields}
            return SearchFilters.model_validate(data), "llm"
        except (LLMUnavailable, ValueError):
            pass
    return parse_query_rule_based(q), "rule_based"
