import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.password_reset import PasswordResetToken
from app.models.profile import Profile
from app.models.user import User
from app.models.user_state import UserState
from app.schemas.auth import (
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    UserOut,
)
from app.services.rate_limit import is_rate_limited, record_hit
from app.services.email import send_email
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookie(response: Response, user: User) -> None:
    token = create_access_token(user.id, user.role)
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.ENV == "production",
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, response: Response, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        name=payload.name,
        role="student",
    )
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id))
    db.add(UserState(user_id=user.id, last_route="/onboarding"))
    db.commit()
    db.refresh(user)

    _set_session_cookie(response, user)
    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    # Only failed attempts count toward the limit, so someone who logs in and out
    # repeatedly (e.g. switching demo accounts) never gets locked out.
    if is_rate_limited(f"login:{ip}", max_calls=5, window_seconds=60):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many login attempts. Try again in a minute.")

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        record_hit(f"login:{ip}")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    _set_session_cookie(response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(settings.COOKIE_NAME, path="/")
    return None


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    # Always respond the same way whether or not the account exists, to avoid leaking
    # which emails are registered.
    generic_response = {"message": "If that email is registered, a reset link has been created."}
    if not user:
        return generic_response

    token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    db.commit()

    reset_link = f"{settings.FRONTEND_ORIGIN}/forgot-password?token={token}"
    sent = send_email(
        user.email, "Reset your ScholarRadar password",
        f"Someone asked to reset the password for {user.email}.\n\nReset it here (valid for 1 hour):\n"
        f"{reset_link}\n\nIf this wasn't you, ignore this email.",
    )

    response = dict(generic_response)
    # Without SMTP there's no other way to deliver the link, so local/dev setups show it
    # directly (as with workspace invites). Never in production: anyone could reset any account.
    if not sent and settings.ENV != "production":
        # No SMTP configured (or running in demo mode): surface the link directly so the
        # flow is demoable without email, same pattern as workspace invites (Section 4.4).
        response["dev_reset_link"] = reset_link
        response["dev_token"] = token
    return response


@router.post("/reset-password")
def reset_password(payload: ResetPasswordIn, db: Session = Depends(get_db)):
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token == payload.token).first()
    if not record or record.used_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or already-used reset token")
    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset token has expired")

    user = db.get(User, record.user_id)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Account no longer exists")

    user.password_hash = hash_password(payload.new_password)
    record.used_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Password updated. You can now log in."}


@router.patch("/password")
def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed."}
