"""Application configuration loaded from environment variables."""

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for Company Brain API.

    All values are loaded from environment variables or the .env file.
    Secrets are never hardcoded here.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── LLM providers ──────────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    together_ai_api_key: str = ""
    cohere_api_key: str = ""

    # ── Google integration ─────────────────────────────────────────────────────
    google_client_id: str = ""
    google_client_secret: str = ""
    # JSON string of the service account key (base64-encoded or raw)
    google_service_account_key: str = ""

    # ── Connectors ─────────────────────────────────────────────────────────────
    telegram_bot_token: str = ""
    notion_integration_token: str = ""

    # ── Inngest ─────────────────────────────────────────────────────────────────
    inngest_event_key: str = ""
    inngest_signing_key: str = ""

    # ── Infrastructure ─────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://dev:dev@localhost:5432/company_brain"
    redis_url: str = "redis://localhost:6379/0"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # ── Observability ──────────────────────────────────────────────────────────
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"
    sentry_dsn: str = ""

    # ── Auth / JWT ─────────────────────────────────────────────────────────────
    # Used to sign internal JWTs issued after Google token exchange.
    # Generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    # Token lifetime in minutes (default 24 hours)
    jwt_expiration_minutes: int = 1440

    # ── Runtime ────────────────────────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"
    debug: bool = False

    # ── CORS ───────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins, e.g. "http://localhost:3000,https://app.example.com"
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002"

    @property
    def allowed_origins(self) -> list[str]:
        """Return CORS origins as a list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        """Return True when running in a production environment."""
        return self.app_env == "production"


settings = Settings()
