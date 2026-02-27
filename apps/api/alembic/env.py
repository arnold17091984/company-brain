"""Alembic environment – configured for async SQLAlchemy with asyncpg."""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy.pool import NullPool

# Import ORM metadata so Alembic can auto-generate migrations
from app.core.database import Base
from app.core.config import settings

# This is the Alembic Config object for access to alembic.ini values.
config = context.config

# Inject the runtime DATABASE_URL from pydantic-settings, overriding the
# placeholder in alembic.ini so credentials are never stored in plain text.
config.set_main_option("sqlalchemy.url", settings.database_url)

# Import all ORM models so their tables are registered on Base.metadata.
# Adding new models here is sufficient for auto-generate to pick them up.
import app.models.database  # noqa: F401, E402

# Configure Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Offline mode (generates SQL without a live DB connection)
# ---------------------------------------------------------------------------


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Emit SQL to stdout instead of connecting to the database.  Useful for
    generating migration scripts for manual review or DBA approval.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online / async mode (connects to DB and applies migrations)
# ---------------------------------------------------------------------------


def do_run_migrations(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode using an async engine."""
    # NullPool prevents asyncpg from keeping connections alive across
    # the short-lived migration process.
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
