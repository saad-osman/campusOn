"""Feature 1: deterministic eligibility checking.

Compares a student profile against an opportunity's eligibility JSON (schema in
SPEC Section 5.1). Pure functions over plain dicts, so it's unit-testable
without a database. Only field matching is fuzzy (see services/fields.py).

Verdicts:
  eligible            every stated requirement is met
  partially_eligible  nothing rules the student out, but something is missing
                      (e.g. "IELTS 6.5 required, you have none")
  not_eligible        a hard requirement fails (degree, year, CGPA, nationality, residency)
  unknown             the opportunity states no checkable requirements, or the
                      profile lacks the data needed to check them
"""
from dataclasses import dataclass, field as dc_field

from app.services.fields import fields_match, norm

DEGREE_LABELS = {"bachelors": "Bachelor's", "masters": "Master's", "phd": "PhD", "postdoc": "postdoc"}


@dataclass
class EligibilityResult:
    verdict: str
    met: list[str] = dc_field(default_factory=list)
    missing: list[str] = dc_field(default_factory=list)
    blocking: list[str] = dc_field(default_factory=list)
    unknown: list[str] = dc_field(default_factory=list)
    notes: list[str] = dc_field(default_factory=list)  # other_requirements, shown as prep items

    def to_dict(self) -> dict:
        return {
            "verdict": self.verdict, "met": self.met, "missing": self.missing,
            "blocking": self.blocking, "unknown": self.unknown, "notes": self.notes,
        }


def convert_cgpa(value: float, from_scale: float, to_scale: float) -> float:
    """Linear scale conversion (e.g. 7.5/10 -> 3.0/4). Approximate by nature;
    institutions publish their own tables, but linear is the common default."""
    if not from_scale:
        return value
    return value / from_scale * to_scale


def _fmt_num(x: float) -> str:
    return f"{x:g}" if float(x).is_integer() else f"{x:.2f}".rstrip("0").rstrip(".")


def _ordinal(n: int) -> str:
    return f"{n}{'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _student_terms(profile: dict) -> list[str]:
    terms = []
    if profile.get("major"):
        terms.append(profile["major"])
    terms += profile.get("interests") or []
    terms += profile.get("skills") or []
    return [t for t in terms if t]


def check_eligibility(profile: dict, eligibility: dict | None, *, degree_levels: list[str] | None = None,
                      allow_llm_fields: bool = False) -> EligibilityResult:
    """`degree_levels` is the opportunity-level list, used when the eligibility
    JSON doesn't carry its own."""
    elig = eligibility or {}
    r = EligibilityResult(verdict="unknown")
    checked_anything = False

    # --- degree level ---
    levels = [lvl for lvl in (elig.get("degree_levels") or degree_levels or []) if lvl]
    if levels and "any" not in levels:
        checked_anything = True
        mine = profile.get("degree_level")
        wanted = ", ".join(DEGREE_LABELS.get(lvl, lvl) for lvl in levels)
        if not mine:
            r.unknown.append(f"Open to {wanted} students; add your degree level to check")
        elif mine in levels:
            r.met.append(f"Your degree level ({DEGREE_LABELS.get(mine, mine)}) qualifies")
        else:
            r.blocking.append(f"Open to {wanted} students; you're a {DEGREE_LABELS.get(mine, mine)} student")

    # --- year of study ---
    min_year, max_year = elig.get("min_year"), elig.get("max_year")
    if min_year or max_year:
        checked_anything = True
        year = profile.get("year_of_study")
        if not year:
            r.unknown.append("Year-of-study requirement; add your year to check")
        elif min_year and year < min_year:
            r.blocking.append(f"Requires {_ordinal(min_year)} year or later; you're in {_ordinal(year)} year")
        elif max_year and year > max_year:
            r.blocking.append(f"Open up to {_ordinal(max_year)} year; you're in {_ordinal(year)} year")
        else:
            r.met.append(f"Your year ({_ordinal(year)}) qualifies")

    # --- CGPA (scale-converted) ---
    min_cgpa = elig.get("min_cgpa")
    if min_cgpa and min_cgpa.get("value"):
        checked_anything = True
        req_value = float(min_cgpa["value"])
        req_scale = float(min_cgpa.get("scale") or 10)
        cgpa, scale = profile.get("cgpa"), float(profile.get("cgpa_scale") or 10)
        req_text = f"CGPA {_fmt_num(req_value)}/{_fmt_num(req_scale)}"
        if cgpa is None:
            r.unknown.append(f"{req_text} required; add your CGPA to check")
        else:
            mine_on_their_scale = convert_cgpa(float(cgpa), scale, req_scale)
            converted = "" if scale == req_scale else f" (≈{mine_on_their_scale:.2f}/{_fmt_num(req_scale)})"
            if mine_on_their_scale + 1e-9 >= req_value:
                r.met.append(f"Your CGPA {_fmt_num(cgpa)}/{_fmt_num(scale)}{converted} meets the {req_text} minimum")
            else:
                r.blocking.append(f"{req_text} required; you have {_fmt_num(cgpa)}/{_fmt_num(scale)}{converted}")

    # --- nationality ---
    allowed = [norm(n) for n in (elig.get("nationality_allowed") or []) if n]
    excluded = [norm(n) for n in (elig.get("nationality_excluded") or []) if n]
    if (allowed and "any" not in allowed) or excluded:
        checked_anything = True
        nat = norm(profile.get("nationality") or "")
        if not nat:
            r.unknown.append("Nationality restrictions apply; add your nationality to check")
        elif nat in excluded:
            r.blocking.append(f"Not open to {profile['nationality']} nationals")
        elif allowed and "any" not in allowed and nat not in allowed:
            r.blocking.append(f"Open only to {', '.join(elig['nationality_allowed'])} nationals")
        else:
            r.met.append("Your nationality is eligible")

    # --- residency ---
    residency = elig.get("residency_required")
    if residency:
        checked_anything = True
        res = norm(profile.get("country_of_residence") or "")
        if not res:
            r.unknown.append(f"Requires residency in {residency}; add your country of residence")
        elif res == norm(residency) or (norm(residency) in ("uae", "united arab emirates")
                                         and res in ("uae", "united arab emirates")):
            r.met.append(f"You live in {residency}")
        else:
            r.blocking.append(f"Requires residency in {residency}")

    # --- English tests: any one listed test at or above its threshold suffices ---
    english = {k: v for k, v in (elig.get("english_requirements") or {}).items() if v}
    if english:
        checked_anything = True
        mine = {k.upper(): v for k, v in (profile.get("english_tests") or {}).items() if v}
        passed = [t for t, need in english.items() if mine.get(t.upper(), -1) >= float(need)]
        if passed:
            r.met.append(f"Your {passed[0]} score meets the requirement")
        else:
            req = " or ".join(f"{t} {_fmt_num(float(v))}" for t, v in english.items())
            have = ", ".join(f"{t} {_fmt_num(v)}" for t, v in mine.items()) or "none"
            r.missing.append(f"{req} required, you have {have}")

    # --- fields (fuzzy) ---
    required_fields = [f for f in (elig.get("required_fields") or []) if f and norm(f) not in ("general", "any")]
    if required_fields:
        checked_anything = True
        terms = _student_terms(profile)
        if not terms:
            r.unknown.append(f"For students in {', '.join(required_fields)}; add your major or interests")
        else:
            hits = [(f, fields_match(f, terms, allow_llm=allow_llm_fields)) for f in required_fields]
            matched = [(f, h) for f, h in hits if h]
            if matched:
                f, h = matched[0]
                why = "" if h in ("any", "related background") else f" ({h})"
                r.met.append(f"Your background fits {f}{why}")
            else:
                r.missing.append(
                    f"Looking for {', '.join(required_fields)}; your major is "
                    f"{profile.get('major') or 'not set'}"
                )

    r.notes = [n for n in (elig.get("other_requirements") or []) if n]

    if r.blocking:
        r.verdict = "not_eligible"
    elif r.missing:
        r.verdict = "partially_eligible"
    elif r.unknown or not checked_anything:
        r.verdict = "unknown"
    else:
        r.verdict = "eligible"
    return r
