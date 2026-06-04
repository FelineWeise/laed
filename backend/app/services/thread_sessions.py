from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.thread_session import ThreadSession


def _topic_clause(topic_node_id: UUID | None):
    if topic_node_id is not None:
        return ThreadSession.topic_node_id == topic_node_id
    return ThreadSession.topic_node_id.is_(None)


async def get_default_thread_session(
    db: AsyncSession,
    *,
    project_id: UUID,
    topic_node_id: UUID | None,
    created_by: UUID,
) -> ThreadSession:
    stmt = (
        select(ThreadSession)
        .where(ThreadSession.project_id == project_id)
        .where(_topic_clause(topic_node_id))
        .order_by(ThreadSession.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    session = ThreadSession(
        project_id=project_id,
        topic_node_id=topic_node_id,
        title="Main",
        created_by=created_by,
    )
    db.add(session)
    await db.flush()
    return session


async def resolve_thread_session_id(
    db: AsyncSession,
    *,
    project_id: UUID,
    topic_node_id: UUID | None,
    thread_session_id: UUID | None,
    created_by: UUID,
) -> UUID:
    if thread_session_id is not None:
        row = await db.get(ThreadSession, thread_session_id)
        if row is not None and row.project_id == project_id:
            return row.id
    default = await get_default_thread_session(
        db,
        project_id=project_id,
        topic_node_id=topic_node_id,
        created_by=created_by,
    )
    return default.id


def maybe_title_from_message(title: str, content: str) -> str:
    snippet = content.strip()[:60]
    if not snippet:
        return title
    if title in ("Main", "New thread", ""):
        return snippet
    return title
