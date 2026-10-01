from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.models.user import User
from app.services.digest import send_all_digests

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_role("admin")


@router.post("/digest/send")
def send_digest_now(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Feature 10: "Send digest now" for the live demo (doesn't skip quiet weeks)."""
    return send_all_digests(db, skip_empty=False)
