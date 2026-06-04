"""Registry rows in `rag.*` required before chunk insert (FK + RLS)."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ChunksTable = Literal["rag.chunks_qwen3", "rag.chunks_nomic"]

EMBEDDING_DIM_NOMIC = 768


async def _set_tenant(session: AsyncSession, tenant_id: str) -> None:
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, true)"),
        {"tid": tenant_id},
    )


async def ensure_rag_project(
    session: AsyncSession,
    *,
    tenant_id: str,
    project_id: str,
    name: str,
    embedding_model: str,
    embedding_dim: int = EMBEDDING_DIM_NOMIC,
) -> None:
    """Insert `rag.projects` with id = app project UUID (D16)."""
    await _set_tenant(session, tenant_id)
    await session.execute(
        text(
            """
            INSERT INTO rag.projects (id, tenant_id, name, embedding_model, embedding_dim)
            VALUES (
              CAST(:id AS uuid),
              CAST(:tenant_id AS uuid),
              :name,
              :embedding_model,
              :embedding_dim
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              embedding_model = EXCLUDED.embedding_model,
              embedding_dim = EXCLUDED.embedding_dim
            """
        ),
        {
            "id": project_id,
            "tenant_id": tenant_id,
            "name": name,
            "embedding_model": embedding_model,
            "embedding_dim": embedding_dim,
        },
    )
    await session.commit()


async def ensure_rag_document(
    session: AsyncSession,
    *,
    tenant_id: str,
    project_id: str,
    document_id: str,
    source_uri: str,
    content_hash: str | None = None,
    metadata: Mapping[str, object] | None = None,
) -> None:
    """Insert/update `rag.documents` with id = files.id (D17)."""
    await _set_tenant(session, tenant_id)
    meta_json = json.dumps(dict(metadata or {}))
    await session.execute(
        text(
            """
            INSERT INTO rag.documents (
              id, tenant_id, project_id, source_uri, content_hash, metadata, updated_at
            )
            VALUES (
              CAST(:id AS uuid),
              CAST(:tenant_id AS uuid),
              CAST(:project_id AS uuid),
              :source_uri,
              :content_hash,
              CAST(:metadata AS jsonb),
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              source_uri = EXCLUDED.source_uri,
              content_hash = EXCLUDED.content_hash,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
            """
        ),
        {
            "id": document_id,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "source_uri": source_uri,
            "content_hash": content_hash,
            "metadata": meta_json,
        },
    )
    await session.commit()


async def delete_document_chunks(
    session: AsyncSession,
    *,
    tenant_id: str,
    document_id: str,
    chunks_table: ChunksTable,
) -> None:
    await _set_tenant(session, tenant_id)
    await session.execute(
        text(
            f"""
            DELETE FROM {chunks_table}
            WHERE tenant_id = CAST(:tenant_id AS uuid)
              AND document_id = CAST(:document_id AS uuid)
            """
        ),
        {"tenant_id": tenant_id, "document_id": document_id},
    )
    await session.commit()


async def delete_rag_document(
    session: AsyncSession,
    *,
    tenant_id: str,
    document_id: str,
    chunks_table: ChunksTable,
) -> None:
    await delete_document_chunks(
        session,
        tenant_id=tenant_id,
        document_id=document_id,
        chunks_table=chunks_table,
    )
    await _set_tenant(session, tenant_id)
    await session.execute(
        text(
            """
            DELETE FROM rag.documents
            WHERE tenant_id = CAST(:tenant_id AS uuid)
              AND id = CAST(:document_id AS uuid)
            """
        ),
        {"tenant_id": tenant_id, "document_id": document_id},
    )
    await session.commit()
