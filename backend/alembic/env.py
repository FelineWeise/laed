import asyncio
from logging.config import fileConfig

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

from app.models import Base
from app.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

EXCLUDE_PREFIXES = {"LiteLLM_", "_prisma"}


def include_name(name, type_, parent_names):
    """Exclude LiteLLM and Prisma tables from Alembic's autogenerate."""
    if type_ == "table":
        return not any(name.startswith(p) for p in EXCLUDE_PREFIXES)
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    connection.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    connection.commit()
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
