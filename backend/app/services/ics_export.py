"""Feature 9: .ics export. Each deadline becomes an all-day event with alarms
7 days and 1 day before. Written directly against RFC 5545 (it's a small,
stable text format), so there's no extra dependency to install."""
from datetime import date, datetime, timedelta

from app.config import get_settings

settings = get_settings()


def _escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> list[str]:
    """RFC 5545 lines are max 75 octets; continuation lines start with a space."""
    out, current = [], ""
    for ch in line:
        if len((current + ch).encode("utf-8")) > 74:
            out.append(current)
            current = " " + ch
        else:
            current += ch
    out.append(current)
    return out


def _event(opp, now: datetime) -> list[str]:
    d: date = opp.deadline
    link = f"{settings.FRONTEND_ORIGIN}/opportunities/{opp.id}"
    description = f"{opp.organization}\nDeadline for {opp.title}.\nDetails: {link}"
    if opp.url:
        description += f"\nOfficial page: {opp.url}"
    lines = [
        "BEGIN:VEVENT",
        f"UID:{opp.id}@scholarradar",
        f"DTSTAMP:{now.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}",
        f"DTEND;VALUE=DATE:{(d + timedelta(days=1)).strftime('%Y%m%d')}",
        f"SUMMARY:{_escape('Deadline: ' + opp.title)}",
        f"DESCRIPTION:{_escape(description)}",
        f"URL:{link}",
        "TRANSP:TRANSPARENT",
    ]
    for days, label in ((7, "1 week"), (1, "tomorrow")):
        lines += [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_escape(f'{opp.title} closes in {label}')}",
            f"TRIGGER:-P{days}D",
            "END:VALARM",
        ]
    lines.append("END:VEVENT")
    return lines


def build_calendar(opportunities, name: str = "ScholarRadar deadlines") -> str:
    now = datetime.utcnow()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ScholarRadar//Deadlines//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(name)}",
    ]
    for opp in opportunities:
        if opp.deadline:
            lines += _event(opp, now)
    lines.append("END:VCALENDAR")
    folded = [part for line in lines for part in _fold(line)]
    return "\r\n".join(folded) + "\r\n"
