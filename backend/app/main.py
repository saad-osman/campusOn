from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    admin,
    auth,
    public_api,
    endorsements,
    notifications,
    review,
    calendar,
    copilot,
    professors,
    tracker,
    documents,
    invites,
    opportunities,
    profile,
    settings as settings_router,
    sources,
    state,
    workspaces,
)

settings = get_settings()

PUBLIC_PATHS = ("/api/public/", "/feed.xml")


class PathCORSMiddleware:
    """Open CORS for the public API, feed and widget (any site may embed them, no
    cookies); credentialed CORS locked to the frontend origin for everything else."""

    def __init__(self, app, frontend_origin: str):
        self.public = CORSMiddleware(app, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
        self.private = CORSMiddleware(app, allow_origins=[frontend_origin], allow_credentials=True,
                                      allow_methods=["*"], allow_headers=["*"])

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "") if scope["type"] in ("http", "websocket") else ""
        target = self.public if path.startswith(PUBLIC_PATHS) else self.private
        await target(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = None
    if settings.ENABLE_SCHEDULER:
        from app.jobs.scheduler import start_scheduler

        scheduler = start_scheduler()
    from app.services import telegram_bot

    telegram_bot.start_bot()  # no-op unless TELEGRAM_BOT_TOKEN is set
    yield
    telegram_bot.stop_bot()
    if scheduler:
        from app.jobs.scheduler import stop_scheduler

        stop_scheduler()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

    app.add_middleware(PathCORSMiddleware, frontend_origin=settings.FRONTEND_ORIGIN)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": settings.APP_NAME, "demo_mode": settings.demo_mode_effective}

    app.include_router(auth.router)
    app.include_router(profile.router)
    app.include_router(state.router)
    app.include_router(settings_router.router)
    app.include_router(workspaces.router)
    app.include_router(invites.router)
    app.include_router(documents.router)
    app.include_router(opportunities.router)
    app.include_router(sources.router)
    app.include_router(tracker.router)
    app.include_router(calendar.router)
    app.include_router(professors.router)
    app.include_router(copilot.router)
    app.include_router(notifications.router)
    app.include_router(review.router)
    app.include_router(endorsements.router)
    app.include_router(admin.router)
    app.include_router(public_api.router)

    return app


app = create_app()
