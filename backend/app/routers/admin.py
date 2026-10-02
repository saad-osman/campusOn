from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import require_role
from app.models.opportunity import Opportunity, SavedOpportunity
from app.models.user import User
from app.services.analytics import analytics_csv, build_analytics
from app.services.digest import send_all_digests
from app.services.scrape_pipeline import record_change

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
        headers={"Content-Disposition": f'attachment; filename="lodestar-report-{date.today().isoformat()}.csv"'},
    )


@router.post("/demo/simulate-change")
def simulate_change(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Live-demo helper (not available in production): extends the deadline of the most
    recently saved open opportunity (e.g. the one a kit was just generated for) by a week,
    through the same change-recording path a re-scrape uses, so everyone following it gets
    a real change alert (Feature 5)."""
    if get_settings().ENV == "production":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not available")
    latest = (
        db.query(SavedOpportunity)
        .join(Opportunity, Opportunity.id == SavedOpportunity.opportunity_id)
        .filter(Opportunity.status == "active", Opportunity.deadline.isnot(None))
        .order_by(SavedOpportunity.created_at.desc())
        .first()
    )
    if not latest:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No saved opportunity with a deadline to change")
    followers = db.query(func.count(SavedOpportunity.id)).filter(
        SavedOpportunity.opportunity_id == latest.opportunity_id).scalar()
    opp = db.get(Opportunity, latest.opportunity_id)
    old = opp.deadline
    opp.deadline = old + timedelta(days=7)
    opp.deadline_text = opp.deadline.strftime("%B %d, %Y")
    change = record_change(db, opp, "deadline", old, opp.deadline)
    db.commit()
    return {"opportunity_id": opp.id, "title": opp.title, "summary": change.summary, "followers": followers}
