from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Core
    APP_NAME: str = "Lodestar"
    ENV: str = "development"
    SECRET_KEY: str = "dev-secret-change-me"
    DATABASE_URL: str = "sqlite:///./scholarradar.db"
    FRONTEND_ORIGIN: str = "http://localhost:3000"

    # Auth
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    COOKIE_NAME: str = "sr_session"

    # LLM
    ANTHROPIC_API_KEY: str | None = None
    EXTRACTION_MODEL: str = "claude-haiku-4-5-20251001"
    WRITING_MODEL: str = "claude-sonnet-5-5"
    DEMO_MODE: bool = False
    ENABLE_SCHEDULER: bool = True

    # Scraping
    SCRAPER_CONTACT_EMAIL: str = "demo@scholarradar.local"
    SCRAPER_MIN_DELAY_SECONDS: float = 2.0
    SCRAPER_TIMEOUT_SECONDS: float = 15.0

    # External APIs
    SEMANTIC_SCHOLAR_API_KEY: str | None = None  # optional; raises the public rate limit

    # Notifications
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "noreply@scholarradar.local"
    TELEGRAM_BOT_TOKEN: str | None = None

    # Uploads
    UPLOAD_DIR: str = "./uploads"
    MAX_CV_BYTES: int = 5 * 1024 * 1024

    @property
    def demo_mode_effective(self) -> bool:
        return self.DEMO_MODE or not self.ANTHROPIC_API_KEY


PLACEHOLDER_SECRETS = {"dev-secret-change-me", "change-me-to-a-random-string", ""}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.ENV == "production" and settings.SECRET_KEY in PLACEHOLDER_SECRETS:
        # Anyone could forge session cookies with a published key.
        raise RuntimeError("Set SECRET_KEY to a long random value before running in production")
    return settings
