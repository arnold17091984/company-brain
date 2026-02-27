"""Entry point for the Company Brain Telegram bot.

Run with:
    python -m app
"""

import asyncio
import logging
import signal
import sys

from telegram.ext import Application, ApplicationBuilder

from app.config import settings
from app.handlers import register_handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


def _init_sentry() -> None:
    """Configure Sentry error tracking when a DSN is provided.

    No-ops gracefully when ``SENTRY_DSN`` is absent so local development
    never requires Sentry to be configured.
    """
    if not settings.sentry_dsn:
        logger.info("Sentry DSN not set – skipping Sentry initialisation.")
        return

    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
    )
    logger.info("Sentry initialised (env=%s).", settings.app_env)


def _build_application() -> Application:  # type: ignore[type-arg]
    """Construct and configure the Telegram ``Application``.

    Returns:
        Fully configured ``Application`` with all handlers registered.
    """
    app: Application = (  # type: ignore[type-arg]
        ApplicationBuilder()
        .token(settings.telegram_bot_token)
        .build()
    )
    register_handlers(app)
    return app


async def _run_polling(app: Application) -> None:  # type: ignore[type-arg]
    """Start the bot in long-polling mode (used for development).

    Polls Telegram's servers for new updates and blocks until a SIGINT or
    SIGTERM is received.

    Args:
        app: Initialised ``Application`` instance.
    """
    logger.info("Starting bot in polling mode (APP_ENV=%s).", settings.app_env)

    stop_event = asyncio.Event()

    def _signal_handler(*_: object) -> None:
        logger.info("Shutdown signal received.")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler)

    async with app:
        await app.start()
        await app.updater.start_polling(drop_pending_updates=True)
        logger.info("Bot is running. Press Ctrl-C to stop.")
        await stop_event.wait()
        logger.info("Stopping updater…")
        await app.updater.stop()
        await app.stop()

    logger.info("Bot shut down cleanly.")


async def _run_webhook(app: Application) -> None:  # type: ignore[type-arg]
    """Start the bot in webhook mode (used for staging and production).

    The ``WEBHOOK_URL`` must be publicly reachable by Telegram's servers and
    must end with the bot's token path component.

    Args:
        app: Initialised ``Application`` instance.
    """
    webhook_url = settings.webhook_url
    if not webhook_url:
        logger.error("WEBHOOK_URL is required in production mode.")
        sys.exit(1)

    logger.info("Starting bot in webhook mode (url=%s).", webhook_url)

    stop_event = asyncio.Event()

    def _signal_handler(*_: object) -> None:
        logger.info("Shutdown signal received.")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler)

    async with app:
        await app.start()
        await app.updater.start_webhook(
            listen="0.0.0.0",
            port=8443,
            webhook_url=webhook_url,
            secret_token=settings.webhook_secret,
            drop_pending_updates=True,
        )
        logger.info("Webhook registered. Bot is running.")
        await stop_event.wait()
        logger.info("Stopping webhook…")
        await app.updater.stop()
        await app.stop()

    logger.info("Bot shut down cleanly.")


def main() -> None:
    """Bootstrap and run the Company Brain bot.

    Selects polling or webhook mode based on ``APP_ENV`` and ``WEBHOOK_URL``.
    Exits with a non-zero status code on fatal configuration errors.
    """
    _init_sentry()

    app = _build_application()

    if settings.use_webhook:
        asyncio.run(_run_webhook(app))
    else:
        asyncio.run(_run_polling(app))


if __name__ == "__main__":
    main()
