"""Backward-compatible re-exports — prefer app.services.retrieval."""

from app.services.retrieval.retriever import (
    ChunkIn,
    RagRetriever,
    rag_session_factory,
)

__all__ = ["ChunkIn", "RagRetriever", "rag_session_factory"]
