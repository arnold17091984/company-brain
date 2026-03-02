"""FastAPI application entry point for Company Brain API."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Third-party SDK initialisation (only when keys are present)
# ---------------------------------------------------------------------------


def _init_sentry() -> None:
    """Initialise Sentry error tracking if DSN is configured."""
    if not settings.sentry_dsn:
        logger.info("Sentry DSN not set – skipping Sentry initialisation")
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=0.2 if settings.is_production else 1.0,
        send_default_pii=False,
    )
    logger.info("Sentry initialised (env=%s)", settings.app_env)


def _init_langfuse() -> None:
    """Initialise Langfuse LLM observability if keys are configured."""
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        logger.info("Langfuse keys not set – skipping Langfuse initialisation")
        return

    # Langfuse reads LANGFUSE_* env vars automatically; calling the module
    # here makes the integration explicit and logs confirmation.
    try:
        from langfuse import Langfuse  # noqa: PLC0415

        Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
        logger.info("Langfuse initialised (host=%s)", settings.langfuse_host)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Langfuse initialisation failed: %s", exc)


# ---------------------------------------------------------------------------
# Lifespan – startup / shutdown resource management
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application-level resources across startup and shutdown.

    Resources initialised here:
    - PostgreSQL async connection pool (via SQLAlchemy engine)
    - Redis client
    - Qdrant client

    Args:
        app: The FastAPI application instance.

    Yields:
        None
    """
    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info("Starting Company Brain API (env=%s)", settings.app_env)

    _init_sentry()
    _init_langfuse()

    # SQLAlchemy engine pool – connect eagerly to surface config errors early
    try:
        from app.core.database import engine  # noqa: PLC0415

        async with engine.begin() as conn:
            await conn.run_sync(lambda _: None)  # ping
        logger.info("PostgreSQL connection pool ready")
    except Exception as exc:  # noqa: BLE001
        logger.warning("PostgreSQL unavailable at startup: %s", exc)

    # Redis
    try:
        import redis.asyncio as aioredis  # noqa: PLC0415

        redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
        await redis_client.ping()
        app.state.redis = redis_client
        logger.info("Redis connection ready")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis unavailable at startup: %s", exc)
        app.state.redis = None

    # Qdrant
    try:
        from qdrant_client import AsyncQdrantClient  # noqa: PLC0415

        qdrant_client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key or None,
        )
        await qdrant_client.get_collections()
        app.state.qdrant = qdrant_client
        logger.info("Qdrant connection ready")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Qdrant unavailable at startup: %s", exc)
        app.state.qdrant = None

    logger.info("Company Brain API startup complete")

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("Shutting down Company Brain API")

    if app.state.redis:
        await app.state.redis.aclose()

    if app.state.qdrant:
        await app.state.qdrant.close()

    await engine.dispose()

    logger.info("Company Brain API shutdown complete")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    """Construct and configure the FastAPI application.

    Returns:
        FastAPI: Fully configured application instance.
    """
    app = FastAPI(
        title="Company Brain API",
        description="AI-powered knowledge engine for enterprise RAG",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(api_router)

    # Health check (unauthenticated, required by Railway)
    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        """Liveness probe used by Railway and load-balancers."""
        return {"status": "ok", "version": "0.1.0"}

    return app


app = create_app()
