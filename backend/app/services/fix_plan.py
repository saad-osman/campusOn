"""Eligibility fix plan: turn "why you don't qualify yet" into dated steps.

Built from the same structured inputs as services/eligibility.py (profile dict + the
opportunity's eligibility JSON), not by parsing the explanation strings. Steps are planned
backwards from the deadline:

- profile:  data we need before we can check a requirement (add your CGPA, ...): due today.
- action:   a gap the student can close (English test, field fit, other requirements).
- blocked:  a hard requirement that can't change before the deadline (degree, year, CGPA,
            nationality, residency); no date, and the plan suggests similar opportunities.

A step whose ideal date has already passed is moved to today and marked `urgent`. Without a
deadline, steps are spaced from today instead and the plan says so.
"""
from datetime import date, timedelta

from app.services.eligibility import check_eligibility

# Days before the deadline (or, with no deadline, after today) for each kind of step.
ENGLISH_BOOK, ENGLISH_TAKE, ENGLISH_SEND = 35, 21, 7
FIELD_FIT, OTHER_REQ = 14, 10
NO_DEADLINE_OFFSETS = {ENGLISH_BOOK: 3, ENGLISH_TAKE: 21, ENGLISH_SEND: 35, FIELD_FIT: 7, OTHER_REQ: 10}

PROFILE_LINK = "/settings/profile"
PROFILE_STEPS = [
    ("degree", "Add your degree level to your profile"),
    ("year", "Add your year of study to your profile"),
    ("cgpa", "Add your CGPA to your profile"),
    ("nationality", "Add your nationality to your profile"),
    ("residency", "Add your country of residence to your profile"),
    ("fields", "Add your major and interests to your profile"),
]
# Phrases eligibility.py uses for "can't check yet" items, mapped to the step above.
UNKNOWN_KEYS = {
    "degree level": "degree", "year-of-study": "year", "cgpa": "cgpa", "nationality": "nationality",
    "residency": "residency", "major or interests": "fields",
}


def _fmt(n: float) -> str:
    return f"{n:g}"


def build_fix_plan(profile: dict, opp, today: date | None = None) -> dict:
    today = today or date.today()
    deadline = opp.deadline if opp.deadline and opp.deadline >= today else None
    check = check_eligibility(profile, opp.eligibility, degree_levels=opp.degree_levels)
    elig = opp.eligibility or {}
    steps: list[dict] = []

    def due(days_before: int) -> tuple[date, bool]:
        if deadline is None:
            return today + timedelta(days=NO_DEADLINE_OFFSETS[days_before]), False
        d = deadline - timedelta(days=days_before)
        return (today, True) if d < today else (d, False)

    def add(key: str, kind: str, title: str, detail: str | None = None, when: int | None = None, link: str | None = None):
        d, urgent = (due(when) if when is not None else ((today, False) if kind == "profile" else (None, False)))
        steps.append({"key": key, "kind": kind, "title": title, "detail": detail, "due": d, "urgent": urgent, "link": link})

    # Missing profile data first: nothing else can be checked without it.
    wanted = {UNKNOWN_KEYS[k] for text in check.unknown for k in UNKNOWN_KEYS if k in text.lower()}
    for key, title in PROFILE_STEPS:
        if key in wanted:
            add(f"profile:{key}", "profile", title, "Then we can check this requirement for you.", link=PROFILE_LINK)

    # English: any one listed test at or above its threshold is enough.
    english = {k: float(v) for k, v in (elig.get("english_requirements") or {}).items() if v}
    if english and any("required, you have" in m for m in check.missing):
        options = " or ".join(f"{t} {_fmt(v)}+" for t, v in english.items())
        add("english:book", "action", f"Book an English test ({options})",
            "Popular dates fill up; pick one that leaves time for results.", ENGLISH_BOOK)
        add("english:take", "action", "Take the English test",
            "Results usually take 1-2 weeks (IELTS and TOEFL).", ENGLISH_TAKE)
        add("english:send", "action", "Send the official score report",
            "Upload it or ask the test centre to send it, as the programme asks.", ENGLISH_SEND)

    # Field fit: not a hard block; show the reviewers why the background is relevant.
    if any(m.startswith("Looking for") for m in check.missing):
        fields = ", ".join(f for f in (elig.get("required_fields") or []) if f)
        add("fields", "action", f"Show how your background fits {fields}",
            "Add relevant courses or projects to your profile and address the fit in your SOP.", FIELD_FIT)

    for i, note in enumerate(check.notes):
        add(f"other:{i}", "action", f"Prepare: {note[0].upper() + note[1:]}", None, OTHER_REQ)

    for i, block in enumerate(check.blocking):
        add(f"blocked:{i}", "blocked", block, "This can't change before the deadline.")

    steps.sort(key=lambda s: (s["kind"] == "blocked", s["due"] or date.max))
    return {
        "verdict": check.verdict,
        "deadline": deadline,
        "has_deadline": deadline is not None,
        "blocked": bool(check.blocking),
        "steps": steps,
    }


def checklist_line(step: dict) -> str:
    when = f" (by {step['due'].strftime('%d %b')})" if step.get("due") else ""
    return f"- [ ] {step['title']}{when}"
