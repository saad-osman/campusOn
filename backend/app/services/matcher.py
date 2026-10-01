"""Feature 2: explainable match score.

score (0-100) = 45% semantic similarity + 25% eligibility + 15% field overlap
              + 10% deadline feasibility + 5% funding preference
plus a small boost for faculty-endorsed opportunities (Feature 12).
Every score comes with its top 3 reasons in plain language.
"""
from datetime import date

from app.services.eligibility import EligibilityResult, check_eligibility
from app.services.embeddings import cosine_similarity
from app.services.fields import match_field_deterministic, norm

WEIGHTS = {"semantic": 45, "eligibility": 25, "fields": 15, "deadline": 10, "funding": 5}
ENDORSEMENT_BOOST = 5

ELIGIBILITY_SCORE = {"eligible": 1.0, "partially_eligible": 0.6, "unknown": 0.5, "not_eligible": 0.0}
FUNDING_SCORE = {"fully_funded": 1.0, "stipend": 0.85, "partial": 0.6, "unknown": 0.4, "unfunded": 0.15}
FUNDING_LABEL = {"fully_funded": "Fully funded", "stipend": "Comes with a stipend", "partial": "Partially funded"}

# all-MiniLM-L6-v2 cosine similarities between a profile and a listing mostly
# land in 0.1-0.6, so stretch that band onto 0-1 to make the component meaningful.
SEM_LOW, SEM_HIGH = 0.10, 0.60


def profile_to_dict(profile) -> dict:
    if profile is None:
        return {}
    return {
        "degree_level": profile.degree_level, "year_of_study": profile.year_of_study,
        "major": profile.major, "cgpa": profile.cgpa, "cgpa_scale": profile.cgpa_scale,
        "nationality": profile.nationality, "country_of_residence": profile.country_of_residence,
        "english_tests": profile.english_tests or {}, "skills": profile.skills or [],
        "interests": profile.interests or [],
    }


def profile_embedding_text(profile) -> str:
    parts = []
    if profile.major:
        parts.append(profile.major)
    parts += profile.interests or []
    parts += profile.skills or []
    if profile.cv_text:
        parts.append(profile.cv_text[:1500])
    return " | ".join(parts)


def deadline_component(deadline: date | None, today: date | None = None) -> tuple[float, str | None]:
    today = today or date.today()
    if deadline is None:
        return 0.7, None
    days = (deadline - today).days
    if days < 0:
        return 0.0, "Deadline has passed"
    if days < 7:
        return 0.3, f"Only {days} day{'s' if days != 1 else ''} left to apply"
    if days < 14:
        return 0.6, f"Deadline in {days} days"
    return 1.0, f"Deadline in {days} days, enough time to prepare"


def _interest_hit(profile: dict, opp) -> str | None:
    """A student interest/skill that the listing visibly matches, for the reasons text."""
    haystack = " ".join([opp.title or "", " ".join(opp.fields or []), opp.description_summary or ""]).lower()
    for term in (profile.get("interests") or []) + (profile.get("skills") or []):
        if term and norm(term) in haystack:
            return term
    for f in opp.fields or []:
        hit = match_field_deterministic(f, profile.get("interests") or [])
        if hit and hit != "any":
            return hit
    return None


def score_opportunity(profile: dict, profile_embedding: list[float] | None, opp,
                      eligibility: EligibilityResult | None = None, endorsed_by: str | None = None,
                      today: date | None = None) -> dict:
    elig = eligibility or check_eligibility(profile, opp.eligibility, degree_levels=opp.degree_levels)

    # semantic
    cos = cosine_similarity(profile_embedding, opp.embedding) if profile_embedding else 0.0
    semantic = max(0.0, min(1.0, (cos - SEM_LOW) / (SEM_HIGH - SEM_LOW))) if profile_embedding else 0.5

    # field overlap
    opp_fields = [f for f in (opp.fields or []) if norm(f) not in ("general", "any")]
    student_terms = ([profile["major"]] if profile.get("major") else []) + (profile.get("interests") or [])
    if not opp_fields:
        field_score, field_hits = 0.5, []
    else:
        field_hits = [f for f in opp_fields if match_field_deterministic(f, student_terms)]
        field_score = len(field_hits) / len(opp_fields) if student_terms else 0.5
        if field_hits:
            field_score = max(field_score, 0.7)  # one solid overlap matters more than coverage

    deadline_score, deadline_reason = deadline_component(opp.deadline, today)
    funding_score = FUNDING_SCORE.get(opp.funding_type or "unknown", 0.4)
    elig_score = ELIGIBILITY_SCORE[elig.verdict]

    components = {
        "semantic": semantic, "eligibility": elig_score, "fields": field_score,
        "deadline": deadline_score, "funding": funding_score,
    }
    total = sum(WEIGHTS[k] * v for k, v in components.items())
    if endorsed_by:
        total += ENDORSEMENT_BOOST
    score = int(round(max(0, min(100, total))))

    # Reasons: strongest positive signals first, then the most important caveat.
    candidates: list[tuple[float, str]] = []
    hit = _interest_hit(profile, opp)
    if hit:
        candidates.append((WEIGHTS["semantic"] * max(semantic, 0.6), f"Matches your {hit} interest"))
    elif semantic >= 0.6:
        candidates.append((WEIGHTS["semantic"] * semantic, "Closely related to your research interests"))
    if elig.verdict == "eligible":
        has_year_rule = any(m.startswith("Your year") for m in elig.met)
        candidates.append((WEIGHTS["eligibility"],
                           "Your year qualifies" if has_year_rule else "You meet every listed requirement"))
    elif elig.verdict == "partially_eligible" and elig.missing:
        candidates.append((WEIGHTS["eligibility"] * 0.5, f"Almost eligible: {elig.missing[0]}"))
    elif elig.verdict == "not_eligible" and elig.blocking:
        candidates.append((WEIGHTS["eligibility"] * 1.2, f"Not eligible: {elig.blocking[0]}"))
    if field_hits and not hit:
        candidates.append((WEIGHTS["fields"] * field_score, f"Fits your field ({field_hits[0]})"))
    if deadline_reason:
        weight = WEIGHTS["deadline"] * (deadline_score if deadline_score >= 0.6 else 1.5)
        candidates.append((weight, deadline_reason))
    if opp.funding_type in FUNDING_LABEL:
        candidates.append((WEIGHTS["funding"] * funding_score * 1.5, FUNDING_LABEL[opp.funding_type]))
    if endorsed_by:
        candidates.append((30, f"Recommended by {endorsed_by}"))

    candidates.sort(key=lambda c: c[0], reverse=True)
    reasons = []
    for _, text in candidates:
        if text not in reasons:
            reasons.append(text)
        if len(reasons) == 3:
            break

    return {
        "score": score,
        "reasons": reasons,
        "components": {k: round(v, 3) for k, v in components.items()},
    }
