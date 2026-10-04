"""Application readiness: one score per Application File.

Pure function over the File's documents and its nearest deadline, so it is cheap enough to
compute on every Files list request (no stored state, nothing to keep in sync).

- Checklist (60%): ticked items across the File's checklist documents ("- [x]" / "- [ ]").
- Writing (40%): application documents (SOP, cover letter, cold email). A document counts
  once it has real content; an untouched AI draft (still carrying the "AI draft — edit before
  sending" label) counts half, so reviewing drafts visibly moves the score.
- Status: "ready" at 90%+, "at_risk" when the deadline is close and the score lags behind it,
  "empty" when there is nothing to measure yet, otherwise "on_track".
"""
import re
from datetime import date

CHECK_RE = re.compile(r"^\s*[-*]\s*\[( |x|X)\]\s+(.+?)\s*$", re.MULTILINE)
WRITING_TYPES = ("sop", "cover_letter", "cold_email")
AI_LABEL_MARK = "AI draft — edit before sending"
MIN_WRITTEN_CHARS = 300  # below this a document is still a stub
CHECKLIST_WEIGHT = 0.6


def checklist_items(content: str) -> list[tuple[bool, str]]:
    return [(m.group(1).lower() == "x", m.group(2)) for m in CHECK_RE.finditer(content or "")]


def _written_chars(content: str) -> int:
    lines = [ln for ln in (content or "").splitlines() if AI_LABEL_MARK not in ln]
    return len("".join(lines).strip())


def compute_readiness(docs, nearest_deadline: date | None, today: date | None = None) -> dict:
    """`docs`: objects with .type, .title and .content (Document rows)."""
    today = today or date.today()
    items: list[tuple[bool, str]] = []
    writing = []
    for d in docs:
        if d.type == "checklist":
            items += checklist_items(d.content)
        elif d.type in WRITING_TYPES:
            writing.append(d)

    done = sum(1 for checked, _ in items if checked)
    check_part = done / len(items) if items else None

    reviewed = drafted_ai = 0
    next_doc_step = None
    for d in writing:
        if _written_chars(d.content) < MIN_WRITTEN_CHARS:
            next_doc_step = next_doc_step or f"Write the {d.title}"
        elif AI_LABEL_MARK in (d.content or ""):
            drafted_ai += 1
            next_doc_step = next_doc_step or f"Review the AI draft of the {d.title}"
        else:
            reviewed += 1
    doc_part = (reviewed + 0.5 * drafted_ai) / len(writing) if writing else None

    if check_part is None and doc_part is None:
        score = 0.0
    elif check_part is None:
        score = doc_part
    elif doc_part is None:
        score = check_part
    else:
        score = CHECKLIST_WEIGHT * check_part + (1 - CHECKLIST_WEIGHT) * doc_part

    days_left = (nearest_deadline - today).days if nearest_deadline else None
    nothing_to_measure = not items and not writing
    if not nothing_to_measure and score >= 0.9:
        status = "ready"
    elif not nothing_to_measure and days_left is not None and (
        (days_left <= 7 and score < 0.85) or (days_left <= 14 and score < 0.6)
    ):
        status = "at_risk"
    elif nothing_to_measure or score == 0:
        status = "empty"  # "Not started"
    else:
        status = "on_track"

    next_item = next((text for checked, text in items if not checked), None)
    if nothing_to_measure:
        next_step = "Add a checklist or generate an application kit"
    else:
        next_step = next_item or next_doc_step

    return {
        "score": round(score * 100),
        "status": status,
        "checklist_done": done,
        "checklist_total": len(items),
        "docs_ready": reviewed,
        "docs_ai_drafts": drafted_ai,
        "docs_total": len(writing),
        "days_left": days_left,
        "next_step": next_step,
    }
