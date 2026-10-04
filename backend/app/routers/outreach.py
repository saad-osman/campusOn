"""Professor outreach tracker (services/outreach.py)."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.opportunity import Opportunity
from app.models.outreach import ProfessorOutreach
from app.models.user import User
from app.services.opportunity_view import visible_to
from app.services.outreach import follow_up_date, remind_due_follow_ups, to_out

router = APIRouter(prefix="/api/outreach", tags=["outreach"])


class OutreachIn(BaseModel):
    professor_name: str = Field(min_length=1, max_length=255)
    affiliation: str | None = Field(default=None, max_length=300)
    author_id: str | None = Field(default=None, max_length=64)
    profile_url: str | None = Field(default=None, max_length=500)
    paper_title: str | None = Field(default=None, max_length=500)
    opportunity_id: str | None = None
    sent_on: date | None = None  # default: today
    notes: str | None = Field(default=None, max_length=2000)


class OutreachPatch(BaseModel):
    status: Literal["sent", "replied", "closed"] | None = None
    followed_up: bool = False  # "I sent a follow-up": count it and plan the next one
    notes: str | None = Field(default=None, max_length=2000)


class OutreachOut(BaseModel):
    id: str
    professor_name: str
    affiliation: str | None
    author_id: str | None
    profile_url: str | None
    paper_title: str | None
    opportunity_id: str | None
    opportunity_title: str | None
    status: str
    sent_on: date
    follow_up_on: date | None
    follow_ups: int
    notes: str | None
    days_until_follow_up: int | None
    follow_up_due: bool


STATUS_ORDER = {"sent": 0, "replied": 1, "closed": 2}


def _mine(db: Session, user: User, outreach_id: str) -> ProfessorOutreach:
    o = db.get(ProfessorOutreach, outreach_id)
    if not o or o.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Outreach entry not found")
    return o


@router.get("", response_model=list[OutreachOut])
def list_outreach(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    remind_due_follow_ups(db, user.id)
    out = [to_out(o) for o in db.query(ProfessorOutreach).filter(ProfessorOutreach.user_id == user.id).all()]
    # Waiting first (follow-up due soonest at the top), then replied, then closed (newest first).
    out.sort(key=lambda o: (STATUS_ORDER.get(o["status"], 3),
                            o["days_until_follow_up"] if o["days_until_follow_up"] is not None else 0,
                            -o["sent_on"].toordinal()))
    return out


@router.post("", response_model=OutreachOut, status_code=status.HTTP_201_CREATED)
def log_outreach(payload: OutreachIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Logging a professor you're still waiting on just returns that open entry.
    q = db.query(ProfessorOutreach).filter(ProfessorOutreach.user_id == user.id, ProfessorOutreach.status == "sent")
    if payload.author_id:
        q = q.filter(ProfessorOutreach.author_id == payload.author_id)
    else:
        q = q.filter(ProfessorOutreach.professor_name == payload.professor_name)
    existing = q.first()
    if existing:
        return to_out(existing)

    opp_title = None
    if payload.opportunity_id:
        opp = db.get(Opportunity, payload.opportunity_id)
        if not opp or not visible_to(user, opp):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
        opp_title = opp.title
    sent_on = payload.sent_on or date.today()
    if sent_on > date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The sent date can't be in the future")
    o = ProfessorOutreach(
        user_id=user.id, professor_name=payload.professor_name, affiliation=payload.affiliation,
        author_id=payload.author_id, profile_url=payload.profile_url, paper_title=payload.paper_title,
        opportunity_id=payload.opportunity_id, opportunity_title=opp_title, status="sent",
        sent_on=sent_on, follow_up_on=follow_up_date(sent_on), notes=payload.notes,
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return to_out(o)


@router.patch("/{outreach_id}", response_model=OutreachOut)
def update_outreach(outreach_id: str, payload: OutreachPatch,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    o = _mine(db, user, outreach_id)
    if payload.followed_up:
        o.follow_ups = (o.follow_ups or 0) + 1
        o.status = "sent"
        o.follow_up_on = follow_up_date(date.today())
        o.reminded_on = None  # a new waiting period: remind again when it's due
    elif payload.status:
        o.status = payload.status
        o.follow_up_on = (o.follow_up_on or follow_up_date(date.today())) if payload.status == "sent" else None
    if payload.notes is not None:
        o.notes = payload.notes or None
    db.commit()
    db.refresh(o)
    return to_out(o)


@router.delete("/{outreach_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_outreach(outreach_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_mine(db, user, outreach_id))
    db.commit()
