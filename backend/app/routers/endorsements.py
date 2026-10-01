"""Feature 12: faculty endorsements."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_role
from app.models.endorsement import Endorsement
from app.models.opportunity import Opportunity
from app.models.profile import Profile
from app.models.user import User
from app.schemas.opportunity import OpportunityOut
from app.services.matcher import profile_to_dict
from app.services.notifications import notify, prefs_for
from app.services.opportunity_view import build_payloads, endorsement_applies, visible_to

router = APIRouter(prefix="/api/endorsements", tags=["endorsements"])
staff = require_role("faculty", "admin")


class EndorsementCreate(BaseModel):
    opportunity_id: str
    note: str | None = Field(default=None, max_length=1000)
    target_degree_level: Literal["bachelors", "masters", "phd"] | None = None
    target_year: int | None = Field(default=None, ge=1, le=8)
    target_major: str | None = Field(default=None, max_length=255)


class EndorsementOut(BaseModel):
    id: str
    opportunity_id: str
    opportunity_title: str
    note: str | None
    target_degree_level: str | None
    target_year: int | None
    target_major: str | None
    created_at: datetime
    notified: int = 0


def _out(e: Endorsement, opp: Opportunity, notified: int = 0) -> dict:
    return {
        "id": e.id, "opportunity_id": e.opportunity_id, "opportunity_title": opp.title, "note": e.note,
        "target_degree_level": e.target_degree_level, "target_year": e.target_year,
        "target_major": e.target_major, "created_at": e.created_at, "notified": notified,
    }


@router.post("", response_model=EndorsementOut, status_code=status.HTTP_201_CREATED)
def create_endorsement(payload: EndorsementCreate, user: User = Depends(staff), db: Session = Depends(get_db)):
    opp = db.get(Opportunity, payload.opportunity_id)
    if not opp or opp.status not in ("active", "pending_review"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Only open opportunities can be endorsed")
    e = Endorsement(faculty_id=user.id, **payload.model_dump())
    db.add(e)
    db.flush()

    target = {k: getattr(e, k) for k in ("target_degree_level", "target_year", "target_major")}
    notified = 0
    students = db.query(User, Profile).join(Profile, Profile.user_id == User.id).filter(User.role == "student").all()
    for student, profile in students:
        if not prefs_for(student)["endorsements"]:
            continue
        if endorsement_applies(target, profile_to_dict(profile)):
            notify(db, student.id, "endorsement", f"{user.name} recommends “{opp.title}”",
                   e.note or "A faculty member thinks this fits students like you.", f"/opportunities/{opp.id}")
            notified += 1
    db.commit()
    db.refresh(e)
    return _out(e, opp, notified)


@router.get("/mine", response_model=list[EndorsementOut])
def my_endorsements(user: User = Depends(staff), db: Session = Depends(get_db)):
    rows = (
        db.query(Endorsement, Opportunity)
        .join(Opportunity, Opportunity.id == Endorsement.opportunity_id)
        .filter(Endorsement.faculty_id == user.id)
        .order_by(Endorsement.created_at.desc())
        .all()
    )
    return [_out(e, o) for e, o in rows]


@router.delete("/{endorsement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_endorsement(endorsement_id: str, user: User = Depends(staff), db: Session = Depends(get_db)):
    e = db.get(Endorsement, endorsement_id)
    if not e or (e.faculty_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Endorsement not found")
    db.delete(e)
    db.commit()
    return None


@router.get("/for-me", response_model=list[OpportunityOut])
def endorsed_for_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Dashboard "Recommended by faculty": endorsements whose target includes this student."""
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    pdict = profile_to_dict(profile)
    rows = db.query(Endorsement).order_by(Endorsement.created_at.desc()).all()
    ids = []
    for e in rows:
        target = {k: getattr(e, k) for k in ("target_degree_level", "target_year", "target_major")}
        if e.opportunity_id not in ids and endorsement_applies(target, pdict):
            ids.append(e.opportunity_id)
    opps = [o for o in (db.get(Opportunity, i) for i in ids) if o and o.status == "active" and visible_to(user, o)]
    return build_payloads(db, opps, user)
