from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.models.scrape_run import ScrapeRun
from app.models.source import Source
from app.models.user import User
from app.schemas.opportunity import ScrapeRunOut, SourceCreate, SourceOut, SourcePatch
from app.services.scrape_pipeline import archive_expired, run_scrape_for_source

router = APIRouter(prefix="/api/sources", tags=["sources"])


@router.get("", response_model=list[SourceOut])
def list_sources(_: User = Depends(require_role("faculty", "admin")), db: Session = Depends(get_db)):
    return db.query(Source).order_by(Source.region, Source.name).all()


@router.post("", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
def create_source(
    payload: SourceCreate,
    _: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    source = Source(name=payload.name, base_url=payload.base_url, region=payload.region, notes=payload.notes)
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.patch("/{source_id}", response_model=SourceOut)
def patch_source(
    source_id: str,
    payload: SourcePatch,
    _: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(source, field, value)
    db.commit()
    db.refresh(source)
    return source


@router.post("/{source_id}/scrape", response_model=ScrapeRunOut)
def trigger_scrape(
    source_id: str,
    _: User = Depends(require_role("faculty", "admin")),
    db: Session = Depends(get_db),
):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    return run_scrape_for_source(db, source)


@router.get("/runs/recent", response_model=list[ScrapeRunOut])
def recent_runs(_: User = Depends(require_role("faculty", "admin")), db: Session = Depends(get_db)):
    return db.query(ScrapeRun).order_by(ScrapeRun.started_at.desc()).limit(50).all()


@router.post("/archive-sweep")
def trigger_archive_sweep(_: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    count = archive_expired(db)
    return {"archived_count": count}
