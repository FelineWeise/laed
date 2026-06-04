"""RAG factory and citation helpers for API routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status

from app.config import settings
from app.services.rag_retriever import ChunksTable, RagRetriever

DEFAULT_CHUNKS_TABLE: ChunksTable = "rag.chunks_nomic"


def get_rag(project_id: UUID) -> RagRetriever:
    if not settings.rag_database_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG is not configured (RAG_DATABASE_URL missing)",
        )
    if not settings.laed_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG tenant is not configured (LAED_TENANT_ID missing)",
        )
    return RagRetriever(
        tenant_id=settings.laed_tenant_id,
        project_id=str(project_id),
        embedding_model=settings.embedding_model,
        chunks_table=DEFAULT_CHUNKS_TABLE,
    )


def build_source_chunks(
    hits: list[dict[str, object]],
    *,
    max_excerpt_len: int = 400,
) -> list[dict[str, object]]:
    """Shape hits for `ai_messages.source_chunks` and SSE done event."""
    out: list[dict[str, object]] = []
    for hit in hits:
        meta = hit.get("metadata")
        meta_dict: dict[str, object] = meta if isinstance(meta, dict) else {}
        content = hit.get("content")
        text_content = content if isinstance(content, str) else ""
        excerpt = text_content[:max_excerpt_len]
        if len(text_content) > max_excerpt_len:
            excerpt += "…"
        document_id = meta_dict.get("file_id") or meta_dict.get("document_id")
        filename = meta_dict.get("filename", "")
        topic_raw = meta_dict.get("topic_node_id")
        topic_node_id = str(topic_raw) if topic_raw is not None else None
        distance = hit.get("distance")
        entry: dict[str, object] = {
            "document_id": str(document_id) if document_id is not None else None,
            "filename": filename,
            "excerpt": excerpt,
            "distance": float(distance) if isinstance(distance, (int, float)) else None,
            "topic_node_id": topic_node_id,
        }
        out.append(entry)
    return out
