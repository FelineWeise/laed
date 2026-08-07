"""RAG factory and citation helpers for API routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status

from app.config import settings
from app.services.rag_registry import (
    EMBEDDING_DIM_NOMIC,
    EMBEDDING_DIM_QWEN3,
    ChunksTable,
)
from app.services.retrieval.retriever import RagRetriever

# Preferred defaults when the embedding model maps to qwen3 (Scaleway primary).
DEFAULT_CHUNKS_TABLE: ChunksTable = "rag.chunks_qwen3"
DEFAULT_EMBEDDING_DIM = EMBEDDING_DIM_QWEN3

# model id substring / exact id → (chunks table, dim)
_EMBEDDING_ROUTES: list[tuple[tuple[str, ...], ChunksTable, int]] = [
    (
        ("qwen3-embedding", "qwen3_embedding", "chunks_qwen3"),
        "rag.chunks_qwen3",
        EMBEDDING_DIM_QWEN3,
    ),
    (
        ("nomic-embed", "nomic_embed", "bge-embed", "bge_embed"),
        "rag.chunks_nomic",
        EMBEDDING_DIM_NOMIC,
    ),
]


def resolve_embedding_store(
    embedding_model: str | None = None,
    *,
    embedding_dim: int | None = None,
) -> tuple[ChunksTable, int]:
    """Pick (chunks_table, dim) for an embedding model id.

    Falls back to settings.embedding_dim / DEFAULT_CHUNKS_TABLE when no
    known substring matches (e.g. thirdparty text-embedding-3-large still
    needs an explicit dim override via EMBEDDING_DIM).
    """
    model = (embedding_model or settings.embedding_model).lower()
    for needles, table, dim in _EMBEDDING_ROUTES:
        if any(n in model for n in needles):
            return table, dim

    dim = embedding_dim if embedding_dim is not None else settings.embedding_dim
    if dim == EMBEDDING_DIM_NOMIC:
        return "rag.chunks_nomic", EMBEDDING_DIM_NOMIC
    return DEFAULT_CHUNKS_TABLE, dim


def rag_is_configured() -> bool:
    return bool(settings.rag_database_url and settings.laed_tenant_id)


def get_rag(
    project_id: UUID,
    *,
    embedding_model: str | None = None,
) -> RagRetriever:
    if not rag_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG is not configured",
        )
    model = embedding_model or settings.embedding_model
    chunks_table, _dim = resolve_embedding_store(model)
    return RagRetriever(
        tenant_id=settings.laed_tenant_id,
        project_id=str(project_id),
        embedding_model=model,
        chunks_table=chunks_table,
    )


def build_source_chunks(
    hits: list[dict[str, object]],
    *,
    max_excerpt_len: int = 400,
) -> list[dict[str, object]]:
    """Shape hits for `ai_messages.source_chunks` and SSE done event."""
    best_by_doc: dict[str, dict[str, object]] = {}
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
        key = str(document_id) if document_id is not None else str(filename)
        prev = best_by_doc.get(key)
        if prev is None:
            best_by_doc[key] = entry
            continue
        prev_dist = prev.get("distance")
        new_dist = entry.get("distance")
        if isinstance(new_dist, (int, float)) and (
            not isinstance(prev_dist, (int, float)) or new_dist < prev_dist
        ):
            best_by_doc[key] = entry
    return list(best_by_doc.values())
