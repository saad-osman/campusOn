from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    auth,
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = None
    if settings.ENABLE_SCHEDULER:
        from app.jobs.scheduler import start_scheduler

        scheduler = start_scheduler()
    yield
    if scheduler:
        from app.jobs.scheduler import stop_scheduler

        stop_scheduler()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_ORIGIN],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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

    return app


app = create_app()
