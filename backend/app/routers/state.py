from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.user_state import UserState
from app.schemas.state import UserStateOut, UserStatePatch
from app.services.rate_limit import check_rate_limit

router = APIRouter(prefix="/api/state", tags=["state"])


def _get_or_create(db: Session, user: User) -> UserState:
    state = db.query(UserState).filter(UserState.user_id == user.id).first()
    if not state:
        state = UserState(user_id=user.id)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


@router.get("", response_model=UserStateOut)
def get_state(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_or_create(db, user)


@router.patch("", response_model=UserStateOut)
def patch_state(
    payload: UserStatePatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    state = _get_or_create(db, user)

    # Server-side backstop for the client's 1-request-per-3s debounce (Section 4.2):
    # if a client somehow floods this, drop the write but still return current state.
    if check_rate_limit(f"state:{user.id}", max_calls=1, window_seconds=2.5):
        if payload.last_route is not None:
            state.last_route = payload.last_route
        if payload.last_workspace_id is not None:
            state.last_workspace_id = payload.last_workspace_id
        if payload.last_document_id is not None:
            state.last_document_id = payload.last_document_id
        if payload.ui_state is not None:
            state.ui_state = {**state.ui_state, **payload.ui_state}
        db.commit()
        db.refresh(state)
    return state
