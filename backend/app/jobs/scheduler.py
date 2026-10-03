"""APScheduler wiring: re-scrape every 6h, expiry check daily, digest weekly
(the digest goes in-app, plus email/Telegram where configured)."""
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.db import SessionLocal
from app.models.source import Source
from app.services.scrape_pipeline import archive_expired, run_scrape_for_source

logger = logging.getLogger("scholarradar.scheduler")

_scheduler: BackgroundScheduler | None = None


def rescrape_all_active_sources() -> None:
    from app.services.memory import log_memory

    log_memory("rescrape start")
    db = SessionLocal()
    try:
        sources = db.query(Source).filter(Source.active.is_(True)).all()
        for source in sources:
            try:
                run_scrape_for_source(db, source)
            except Exception:
                logger.exception("Scrape failed for source %s", source.id)
    finally:
        db.close()
        log_memory("rescrape end")


def run_daily_expiry_check() -> None:
    db = SessionLocal()
    try:
        count = archive_expired(db)
        logger.info("Archive sweep: %d opportunity(ies) expired", count)
    finally:
        db.close()


def run_weekly_digest() -> None:
    from app.services.digest import send_all_digests

    db = SessionLocal()
    try:
        logger.info("Weekly digest: %s", send_all_digests(db))
    except Exception:
        logger.exception("Weekly digest failed")
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    scheduler = BackgroundScheduler()
    scheduler.add_job(rescrape_all_active_sources, "interval", hours=6, id="rescrape")
    scheduler.add_job(run_daily_expiry_check, "interval", days=1, id="expiry")
    scheduler.add_job(run_weekly_digest, "interval", weeks=1, id="digest")
    scheduler.start()
    _scheduler = scheduler
    return scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
