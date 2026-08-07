"""Isolated async RAG DB sessions for Celery workers."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


@asynccontextmanager
async def isolated_rag_session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession] | None]:
    """Yield a fresh session factory per ``asyncio.run()`` (Celery fork workers).

    The module-level pool in ``retrieval.retriever`` must not be reused across
    worker tasks — connections bind to a closed event loop on the second run.
    """
    if not settings.rag_database_url:
        yield None
        return

    engine = create_async_engine(settings.rag_database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        yield factory
    finally:
        await engine.dispose()
