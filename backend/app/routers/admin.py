from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.models.user import User
from app.services.analytics import analytics_csv, build_analytics
from app.services.digest import send_all_digests

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_role("admin")


@router.post("/digest/send")
def send_digest_now(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Feature 10: "Send digest now" for the live demo (doesn't skip quiet weeks)."""
    return send_all_digests(db, skip_empty=False)


@router.get("/analytics")
def analytics(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Feature 13: everything the admin dashboard charts."""
    return build_analytics(db)


@router.get("/analytics.csv")
def analytics_export(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return Response(
        content=analytics_csv(build_analytics(db)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="scholarradar-report-{date.today().isoformat()}.csv"'},
    )
