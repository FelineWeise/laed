"""Multi-tenant vector retrieval against `rag.*` (separate RAG database).

Embeddings are produced via the shared LiteLLM gateway so GPU lifecycle hooks apply.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import TypedDict
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.services.llm import gateway
from app.services.rag_registry import ChunksTable, delete_document_chunks, ensure_rag_document


class ChunkIn(TypedDict):
    index: int
    content: str
    metadata: dict[str, object]


_engine = create_async_engine(
    settings.rag_database_url,
    pool_pre_ping=True,
) if settings.rag_database_url else None
_session_factory: async_sessionmaker[AsyncSession] | None = (
    async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)
    if _engine is not None
    else None
)


def rag_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        msg = "RAG_DATABASE_URL is not set; configure the dedicated RAG Postgres DSN."
        raise RuntimeError(msg)
    return _session_factory


class RagRetriever:
    """Tenant-scoped similarity search and upserts with Postgres RLS."""

    def __init__(
        self,
        tenant_id: str,
        project_id: str,
        *,
        embedding_model: str,
        chunks_table: ChunksTable,
    ) -> None:
        self.tenant_id = tenant_id
        self.project_id = project_id
        self.embedding_model = embedding_model
        self.chunks_table = chunks_table

    async def embed(self, text_input: str) -> list[float]:
        return await gateway.embed(text_input, model=self.embedding_model)

    async def query(
        self,
        query_text: str,
        *,
        top_k: int = 10,
        topic_node_id: UUID | None = None,
    ) -> list[dict[str, object]]:
        embedding = await self.embed(query_text)
        emb_literal = "[" + ",".join(str(x) for x in embedding) + "]"
        factory = rag_session_factory()
        topic_clause = ""
        params: dict[str, object] = {
            "query_embedding": emb_literal,
            "tenant_id": self.tenant_id,
            "project_id": self.project_id,
            "top_k": top_k,
        }
        if topic_node_id is not None:
            topic_clause = """
                  AND (
                    metadata->>'topic_node_id' IS NULL
                    OR metadata->>'topic_node_id' = :topic_node_id
                  )
            """
            params["topic_node_id"] = str(topic_node_id)

        async with factory() as session:
            await session.execute(
                text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                {"tid": self.tenant_id},
            )
            sql = text(
                f"""
                SELECT id, content, metadata,
                       embedding <=> CAST(:query_embedding AS vector) AS distance
                FROM {self.chunks_table}
                WHERE tenant_id = CAST(:tenant_id AS uuid)
                  AND project_id = CAST(:project_id AS uuid)
                  {topic_clause}
                ORDER BY embedding <=> CAST(:query_embedding AS vector)
                LIMIT :top_k
                """
            )
            result = await session.execute(sql, params)
            return [dict(row._mapping) for row in result]

    async def upsert_document_chunks(
        self,
        document_id: str,
        chunks: Sequence[ChunkIn],
        *,
        source_uri: str,
        content_hash: str | None = None,
        document_metadata: dict[str, object] | None = None,
    ) -> None:
        if not chunks:
            return
        contents = [c["content"] for c in chunks]
        embeddings = await gateway.embed_many(contents, model=self.embedding_model)
        factory = rag_session_factory()
        async with factory() as session:
            await ensure_rag_document(
                session,
                tenant_id=self.tenant_id,
                project_id=self.project_id,
                document_id=document_id,
                source_uri=source_uri,
                content_hash=content_hash,
                metadata=document_metadata,
            )
            await delete_document_chunks(
                session,
                tenant_id=self.tenant_id,
                document_id=document_id,
                chunks_table=self.chunks_table,
            )
            await session.execute(
                text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                {"tid": self.tenant_id},
            )
            for chunk, emb in zip(chunks, embeddings, strict=True):
                emb_literal = "[" + ",".join(str(x) for x in emb) + "]"
                meta = chunk.get("metadata") or {}
                await session.execute(
                    text(
                        f"""
                        INSERT INTO {self.chunks_table}
                        (tenant_id, project_id, document_id, chunk_index,
                         content, embedding, metadata)
                        VALUES (
                          CAST(:tenant_id AS uuid),
                          CAST(:project_id AS uuid),
                          CAST(:document_id AS uuid),
                          :chunk_index,
                          :content,
                          CAST(:embedding AS vector),
                          CAST(:metadata AS jsonb)
                        )
                        """
                    ),
                    {
                        "tenant_id": self.tenant_id,
                        "project_id": self.project_id,
                        "document_id": document_id,
                        "chunk_index": chunk["index"],
                        "content": chunk["content"],
                        "embedding": emb_literal,
                        "metadata": json.dumps(meta),
                    },
                )
            await session.commit()
