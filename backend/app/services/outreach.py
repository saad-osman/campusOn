"""Professor outreach tracker: who the student emailed, and when to follow up.

Follow-up reminders are created lazily (when the student's notifications or outreach list
load), not by a background job: the free host sleeps, so a scheduler can't be relied on, and
a reminder is only useful when the student is looking anyway. One reminder per due date.
"""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.outreach import ProfessorOutreach
from app.services.notifications import notify

FOLLOW_UP_DAYS = 7


def follow_up_date(from_day: date) -> date:
    return from_day + timedelta(days=FOLLOW_UP_DAYS)


def remind_due_follow_ups(db: Session, user_id: str, today: date | None = None) -> int:
    today = today or date.today()
    due = (
        db.query(ProfessorOutreach)
        .filter(
            ProfessorOutreach.user_id == user_id,
            ProfessorOutreach.status == "sent",
            ProfessorOutreach.follow_up_on.isnot(None),
            ProfessorOutreach.follow_up_on <= today,
        )
        .all()
    )
    created = 0
    for o in due:
        if o.reminded_on and o.reminded_on >= o.follow_up_on:
            continue  # already reminded for this due date
        waited = (today - o.sent_on).days
        days = "day" if waited == 1 else "days"
        notify(
            db, user_id, "outreach",
            f"Follow up with {o.professor_name}",
            f"You emailed them {waited} {days} ago with no reply logged. "
            "A short, polite follow-up often gets a response.",
            "/professors#outreach",
        )
        o.reminded_on = today
        created += 1
    if created:
        db.commit()
    return created


def to_out(o: ProfessorOutreach, today: date | None = None) -> dict:
    today = today or date.today()
    days = (o.follow_up_on - today).days if (o.status == "sent" and o.follow_up_on) else None
    return {
        "id": o.id, "professor_name": o.professor_name, "affiliation": o.affiliation,
        "author_id": o.author_id, "profile_url": o.profile_url, "paper_title": o.paper_title,
        "opportunity_id": o.opportunity_id, "opportunity_title": o.opportunity_title,
        "status": o.status, "sent_on": o.sent_on, "follow_up_on": o.follow_up_on,
        "follow_ups": o.follow_ups or 0, "notes": o.notes,
        "days_until_follow_up": days, "follow_up_due": days is not None and days <= 0,
    }
