from __future__ import annotations

import asyncio
import hashlib
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.services.ingestion import CHUNK_SIZE, _chunk_text
from app.services.rag import resolve_embedding_store
from app.services.rag_session import isolated_rag_session_factory
from app.services.retrieval.retriever import ChunkIn, RagRetriever
from app.worker import celery_app


async def _index_text_async(
    *,
    project_id: UUID,
    document_id: str,
    text: str,
    metadata: dict[str, object],
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> None:
    if not settings.rag_database_url or not settings.laed_tenant_id:
        return
    parts = _chunk_text(text)
    if not parts:
        return
    chunks: list[ChunkIn] = [
        {"index": i, "content": part, "metadata": {**metadata, "chunk": i}}
        for i, part in enumerate(parts)
    ]
    chunks_table, _dim = resolve_embedding_store(settings.embedding_model)
    retriever = RagRetriever(
        tenant_id=settings.laed_tenant_id,
        project_id=str(project_id),
        embedding_model=settings.embedding_model,
        chunks_table=chunks_table,
    )
    topic_raw = metadata.get("topic_node_id")
    topic_node_id = str(topic_raw) if topic_raw else None
    await retriever.upsert_document_chunks(
        document_id,
        chunks,
        source_uri=f"conversation:{document_id}",
        content_hash=hashlib.sha256(text.encode()).hexdigest(),
        document_metadata=metadata,
        topic_node_id=topic_node_id,
        visibility_scope="project",
        session_factory=session_factory,
    )


async def _run_index_with_fresh_engine(
    project_id: UUID,
    document_id: str,
    text: str,
    metadata: dict[str, object],
) -> None:
    """Celery workers need a per-task engine (forked process + asyncio.run)."""
    if not settings.rag_database_url:
        return

    async with isolated_rag_session_factory() as factory:
        if factory is None:
            return
        async with factory() as session:
            from app.services.rag_registry import ensure_rag_tenant

            if settings.laed_tenant_id:
                await ensure_rag_tenant(session, tenant_id=settings.laed_tenant_id)
        await _index_text_async(
            project_id=project_id,
            document_id=document_id,
            text=text,
            metadata=metadata,
            session_factory=factory,
        )


@celery_app.task(name="index_conversation_turn")
def index_conversation_turn(
    project_id: str,
    user_text: str,
    assistant_text: str,
    *,
    conversation_id: str | None = None,
    topic_node_id: str | None = None,
    source: str = "conversation",
) -> None:
    combined = f"User: {user_text}\n\nAssistant: {assistant_text}"
    doc_id = conversation_id or hashlib.sha256(combined.encode()).hexdigest()[:32]
    meta: dict[str, object] = {
        "source": source,
        "conversation_id": conversation_id,
        "topic_node_id": topic_node_id,
    }

    asyncio.run(
        _run_index_with_fresh_engine(
            UUID(project_id),
            doc_id,
            combined,
            meta,
        )
    )
