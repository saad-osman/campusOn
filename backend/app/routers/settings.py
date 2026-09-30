from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/settings", tags=["settings"])
settings = get_settings()


@router.get("/export")
def export_my_data(user: User = Depends(get_current_user)):
    data = {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "created_at": user.created_at.isoformat(),
        }
    }
    if user.profile:
        p = user.profile
        data["profile"] = {
            "degree_level": p.degree_level,
            "year_of_study": p.year_of_study,
            "major": p.major,
            "cgpa": p.cgpa,
            "cgpa_scale": p.cgpa_scale,
            "nationality": p.nationality,
            "country_of_residence": p.country_of_residence,
            "english_tests": p.english_tests,
            "skills": p.skills,
            "interests": p.interests,
            "cv_text": p.cv_text,
            "cv_filename": p.cv_filename,
        }
    if user.user_state:
        data["state"] = {
            "last_route": user.user_state.last_route,
            "ui_state": user.user_state.ui_state,
        }
    return data


@router.delete("/account", status_code=204)
def delete_my_account(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(user)  # cascades to profile / user_state via relationship config
    db.commit()
    response.delete_cookie(settings.COOKIE_NAME, path="/")
    return None
