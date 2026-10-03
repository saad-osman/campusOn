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

    # LLM. LLM_PROVIDER picks the backend for every AI feature:
    #   anthropic          ANTHROPIC_API_KEY, Claude models (default)
    #   gemini             LLM_API_KEY from Google AI Studio (free tier), OpenAI-compatible endpoint
    #   openai_compatible  LLM_API_KEY + LLM_BASE_URL (Groq, Hugging Face router, OpenAI, ...)
    LLM_PROVIDER: str = "anthropic"
    ANTHROPIC_API_KEY: str | None = None
    LLM_API_KEY: str | None = None
    LLM_BASE_URL: str | None = None
    # Empty means the provider's default (see extraction_model / writing_model below).
    EXTRACTION_MODEL: str = ""
    WRITING_MODEL: str = ""
    DEMO_MODE: bool = False
    ENABLE_SCHEDULER: bool = True

    # Scraping
    SCRAPER_CONTACT_EMAIL: str = "demo@scholarradar.local"
    SCRAPER_MIN_DELAY_SECONDS: float = 2.0
    SCRAPER_TIMEOUT_SECONDS: float = 15.0
    # Pages are read only up to this size: BeautifulSoup needs many times a page's size in
    # memory, and one oversized page must not take the 512 MB API host down.
    SCRAPER_MAX_BYTES: int = 2 * 1024 * 1024

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
    def llm_api_key(self) -> str | None:
        return self.ANTHROPIC_API_KEY if self.LLM_PROVIDER == "anthropic" else self.LLM_API_KEY

    @property
    def llm_base_url(self) -> str | None:
        if self.LLM_PROVIDER == "gemini":
            return self.LLM_BASE_URL or "https://generativelanguage.googleapis.com/v1beta/openai"
        return self.LLM_BASE_URL

    @property
    def extraction_model(self) -> str:
        return self.EXTRACTION_MODEL or _DEFAULT_MODELS.get(self.LLM_PROVIDER, _DEFAULT_MODELS["anthropic"])[0]

    @property
    def writing_model(self) -> str:
        return self.WRITING_MODEL or _DEFAULT_MODELS.get(self.LLM_PROVIDER, _DEFAULT_MODELS["anthropic"])[1]

    @property
    def demo_mode_effective(self) -> bool:
        return self.DEMO_MODE or not self.llm_api_key


# (extraction model, writing model) per provider when EXTRACTION_MODEL / WRITING_MODEL are unset.
_DEFAULT_MODELS = {
    "anthropic": ("claude-haiku-4-5-20251001", "claude-sonnet-5-5"),
    # Google's "-latest" alias tracks the current Flash-Lite, so retiring a version doesn't
    # break the app. Lite answers in ~1-2 s; full Flash took 11-30 s and often returned 503.
    "gemini": ("gemini-flash-lite-latest", "gemini-flash-lite-latest"),
}

PLACEHOLDER_SECRETS = {"dev-secret-change-me", "change-me-to-a-random-string", ""}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.ENV == "production" and settings.SECRET_KEY in PLACEHOLDER_SECRETS:
        # Anyone could forge session cookies with a published key.
        raise RuntimeError("Set SECRET_KEY to a long random value before running in production")
    return settings
