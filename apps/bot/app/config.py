"""Application configuration loaded from environment variables."""

from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for Company Brain Bot.

    All values are loaded from environment variables or the .env file.
    Secrets are never hardcoded here.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Telegram ───────────────────────────────────────────────────────────────
    telegram_bot_token: str

    # ── API ────────────────────────────────────────────────────────────────────
    api_base_url: str = "http://localhost:8000"
    api_auth_token: str = ""
    default_language: str = "en"

    # ── Infrastructure ─────────────────────────────────────────────────────────
    redis_url: str | None = None

    # ── Observability ──────────────────────────────────────────────────────────
    sentry_dsn: str | None = None

    # ── Runtime ────────────────────────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"

    # ── Webhook (production only) ──────────────────────────────────────────────
    webhook_url: str | None = None
    webhook_secret: str | None = None

    @property
    def is_production(self) -> bool:
        """Return True when running in a production environment."""
        return self.app_env == "production"

    @property
    def use_webhook(self) -> bool:
        """Return True when a webhook URL is configured and env is production."""
        return self.is_production and self.webhook_url is not None


settings = Settings()  # type: ignore[call-arg]
