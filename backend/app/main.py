from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, profile, settings as settings_router, state

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME)

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

    return app


app = create_app()
