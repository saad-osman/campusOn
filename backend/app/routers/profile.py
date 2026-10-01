from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.profile import Profile
from app.models.user import User
from app.schemas.profile import CVExtractionOut, ProfileOut, ProfilePatch
from app.services.cv_parser import CVParseError, extract_cv_text, extract_profile
from app.services.opportunity_view import refresh_profile_embedding

router = APIRouter(prefix="/api/profile", tags=["profile"])
settings = get_settings()

# Edits to these change what the student "is about", so the embedding is recomputed.
EMBEDDING_FIELDS = {"major", "interests", "skills"}


def _get_or_create(db: Session, user: User) -> Profile:
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    if not profile:
        profile = Profile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("", response_model=ProfileOut)
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_or_create(db, user)


@router.patch("", response_model=ProfileOut)
def patch_profile(
    payload: ProfilePatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _get_or_create(db, user)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(profile, field, value)
    if EMBEDDING_FIELDS & changes.keys():
        refresh_profile_embedding(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.post("/cv", response_model=CVExtractionOut)
async def upload_cv(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Feature 1. Parses the CV in memory (the file itself is never stored), keeps
    the extracted text, and returns suggested profile values for the student to
    review. Nothing in the profile changes until they save those values."""
    data = await file.read(settings.MAX_CV_BYTES + 1)
    if len(data) > settings.MAX_CV_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "CV must be 5 MB or smaller")
    try:
        text = extract_cv_text(file.filename or "cv", data)
    except CVParseError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    finally:
        del data

    suggestions, method = extract_profile(text)
    profile = _get_or_create(db, user)
    profile.cv_text = text
    profile.cv_filename = file.filename
    refresh_profile_embedding(profile)
    db.commit()
    return {"cv_filename": file.filename, "suggestions": suggestions, "method": method, "characters": len(text)}


@router.delete("/cv", status_code=status.HTTP_204_NO_CONTENT)
def delete_cv(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = _get_or_create(db, user)
    profile.cv_text = None
    profile.cv_filename = None
    refresh_profile_embedding(profile)
    db.commit()
    return None
