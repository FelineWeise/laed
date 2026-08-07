"""Multi-tenant vector retrieval against `rag.*` (separate RAG database)."""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from typing import TypedDict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.services.llm import gateway
from app.services.rag_registry import ChunksTable, delete_document_chunks, ensure_rag_document
from app.services.retrieval.scope import RetrievalScope

logger = logging.getLogger(__name__)


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

    def _build_scope_where(self, scope: RetrievalScope) -> tuple[str, dict[str, object]]:
        primary_sql, primary_params = scope.sql_project_filter()
        linked_sql, linked_params = scope.sql_linked_filter()

        if scope.include_linked and linked_sql:
            where = f"""
                (
                  ({primary_sql})
                  OR ({linked_sql})
                )
            """
            return where, {**primary_params, **linked_params}

        return primary_sql, primary_params

    async def query(
        self,
        query_text: str,
        *,
        scope: RetrievalScope,
        top_k: int = 10,
        viewer_user_id: str | None = None,
    ) -> list[dict[str, object]]:
        logger.info(
            "rag_query scope level=%s projects=%s topics=%s include_linked=%s session=%s",
            scope.level,
            [str(p) for p in scope.project_ids],
            [str(t) for t in scope.topic_ids],
            scope.include_linked,
            str(scope.session_scope_id) if scope.session_scope_id else None,
        )

        embedding = await self.embed(query_text)
        emb_literal = "[" + ",".join(str(x) for x in embedding) + "]"
        scope_where, scope_params = self._build_scope_where(scope)
        visibility_sql = ""
        if viewer_user_id:
            scope_params["viewer_user_id"] = viewer_user_id
            # private: owner only
            # project / NULL: any project member (already scoped by project filter)
            # restricted: owner OR viewer listed in metadata.allowed_user_ids
            visibility_sql = """
                AND (
                  visibility_scope IS NULL
                  OR visibility_scope = 'project'
                  OR (
                    visibility_scope = 'private'
                    AND uploaded_by = CAST(:viewer_user_id AS uuid)
                  )
                  OR (
                    visibility_scope = 'restricted'
                    AND (
                      uploaded_by = CAST(:viewer_user_id AS uuid)
                      OR COALESCE(metadata->'allowed_user_ids', '[]'::jsonb)
                          ? :viewer_user_id
                    )
                  )
                )
            """

        params: dict[str, object] = {
            "query_embedding": emb_literal,
            "tenant_id": self.tenant_id,
            "top_k": top_k,
            **scope_params,
        }

        factory = rag_session_factory()
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
                  AND ({scope_where}){visibility_sql}
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
        topic_node_id: str | None = None,
        folder_id: str | None = None,
        uploaded_by: str | None = None,
        visibility_scope: str = "project",
        folder_path: str | None = None,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
    ) -> None:
        if not chunks:
            return
        contents = [c["content"] for c in chunks]
        embeddings = await gateway.embed_many(contents, model=self.embedding_model)
        factory = session_factory or rag_session_factory()
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
                meta = dict(chunk.get("metadata") or {})
                if topic_node_id:
                    meta.setdefault("topic_node_id", topic_node_id)
                if folder_id:
                    meta.setdefault("folder_id", folder_id)
                if folder_path:
                    meta.setdefault("folder_path", folder_path)
                if uploaded_by:
                    meta.setdefault("uploaded_by", uploaded_by)
                meta.setdefault("visibility_scope", visibility_scope)

                await session.execute(
                    text(
                        f"""
                        INSERT INTO {self.chunks_table}
                        (tenant_id, project_id, document_id, chunk_index,
                         content, embedding, metadata,
                         topic_node_id, folder_id, uploaded_by, visibility_scope)
                        VALUES (
                          CAST(:tenant_id AS uuid),
                          CAST(:project_id AS uuid),
                          CAST(:document_id AS uuid),
                          :chunk_index,
                          :content,
                          CAST(:embedding AS vector),
                          CAST(:metadata AS jsonb),
                          CAST(:topic_node_id AS uuid),
                          CAST(:folder_id AS uuid),
                          CAST(:uploaded_by AS uuid),
                          :visibility_scope
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
                        "topic_node_id": topic_node_id,
                        "folder_id": folder_id,
                        "uploaded_by": uploaded_by,
                        "visibility_scope": visibility_scope,
                    },
                )
            await session.commit()
