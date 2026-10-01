import re

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.opportunity import Opportunity
from app.models.tracker import TrackerItem
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services.ics_export import build_calendar
from app.services.opportunity_view import visible_to
from app.services.workspace_access import require_workspace_role

router = APIRouter(tags=["calendar"])


def _ics_response(body: str, filename: str) -> Response:
    safe = re.sub(r"[^\w.-]+", "-", filename).strip("-")[:80] or "deadlines"
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe}.ics"'},
    )


@router.get("/api/opportunities/{opportunity_id}/calendar.ics")
def opportunity_calendar(opportunity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    opp = db.get(Opportunity, opportunity_id)
    if not opp or not visible_to(user, opp):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    if not opp.deadline:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This opportunity has no fixed deadline to export")
    return _ics_response(build_calendar([opp], name=opp.title), opp.title)


@router.get("/api/workspaces/{workspace_id}/calendar.ics")
def workspace_calendar(
    workspace_id: str,
    _: WorkspaceMember = Depends(require_workspace_role("viewer")),
    db: Session = Depends(get_db),
):
    ws = db.get(Workspace, workspace_id)
    opp_ids = [
        i.opportunity_id for i in db.query(TrackerItem).filter(TrackerItem.workspace_id == workspace_id).all()
        if i.opportunity_id
    ]
    opps = db.query(Opportunity).filter(Opportunity.id.in_(opp_ids)).all() if opp_ids else []
    return _ics_response(build_calendar(opps, name=f"{ws.name} deadlines"), ws.name)
