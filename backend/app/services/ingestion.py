from __future__ import annotations

import asyncio
import hashlib
from io import BytesIO
from uuid import UUID

from app.config import settings
from app.models.base import async_session
from app.models.file import File
from app.models.file_grant import list_grant_user_ids, visibility_scope_for_file
from app.models.folder import Folder
from app.models.project import Project
from app.services.file_service import download_bytes
from app.services.rag_registry import ensure_rag_project
from app.services.rag_session import isolated_rag_session_factory
from app.services.retrieval.retriever import ChunkIn, RagRetriever
from app.services.rag import resolve_embedding_store
from app.worker import celery_app

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def _chunk_text(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = max(0, end - CHUNK_OVERLAP)
    return chunks


def _extract_text(filename: str, raw: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".txt") or lower.endswith(".md"):
        return raw.decode("utf-8", errors="replace")
    if lower.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(raw))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    if lower.endswith(".docx"):
        from docx import Document

        doc = Document(BytesIO(raw))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text)
    return raw.decode("utf-8", errors="replace")


async def _ingest_async(file_id: UUID) -> None:
    async with isolated_rag_session_factory() as rag_factory:
        async with async_session() as db:
            file_row = await db.get(File, file_id)
            if not file_row:
                return
            file_row.ingestion_status = "processing"
            await db.commit()

            try:
                raw = download_bytes(file_row.minio_key)
                text = _extract_text(file_row.filename, raw)
                parts = _chunk_text(text)
                meta = dict(file_row.file_metadata or {})
                topic_raw = meta.get("topic_node_id")
                topic_node_id = str(topic_raw) if topic_raw else None
                folder_id = str(file_row.folder_id)
                folder_path = meta.get("folder_path")
                if not folder_path:
                    folder_row = await db.get(Folder, file_row.folder_id)
                    folder_path = folder_row.path if folder_row else None
                uploaded_by = str(file_row.uploaded_by) if file_row.uploaded_by else None
                grant_ids = await list_grant_user_ids(db, file_row.id)
                grant_id_strs = [str(u) for u in grant_ids]
                vis_scope = visibility_scope_for_file(
                    file_row.is_private, len(grant_ids)
                )

                project = await db.get(Project, file_row.project_id)
                project_name = project.name if project else str(file_row.project_id)
                chunks_table, embedding_dim = resolve_embedding_store(
                    settings.embedding_model
                )

                if rag_factory is not None and settings.laed_tenant_id:
                    async with rag_factory() as rag_session:
                        await ensure_rag_project(
                            rag_session,
                            tenant_id=settings.laed_tenant_id,
                            project_id=str(file_row.project_id),
                            name=project_name,
                            embedding_model=settings.embedding_model,
                            embedding_dim=embedding_dim,
                        )

                if not settings.rag_database_url or not settings.laed_tenant_id:
                    raise RuntimeError("RAG not configured")

                retriever = RagRetriever(
                    tenant_id=settings.laed_tenant_id,
                    project_id=str(file_row.project_id),
                    embedding_model=settings.embedding_model,
                    chunks_table=chunks_table,
                )
                chunks: list[ChunkIn] = []
                for idx, part in enumerate(parts):
                    chunk_meta: dict[str, object] = {
                        "file_id": str(file_row.id),
                        "filename": file_row.filename,
                        "topic_node_id": topic_node_id,
                        "folder_id": folder_id,
                        "folder_path": folder_path,
                        "uploaded_by": uploaded_by,
                        "visibility_scope": vis_scope,
                        "source": "file",
                    }
                    if vis_scope == "restricted":
                        chunk_meta["allowed_user_ids"] = grant_id_strs
                    chunks.append(
                        ChunkIn(index=idx, content=part, metadata=chunk_meta),
                    )

                content_hash = hashlib.sha256(raw).hexdigest()
                doc_meta = {**meta, "folder_id": folder_id, "folder_path": folder_path}
                await retriever.upsert_document_chunks(
                    str(file_row.id),
                    chunks,
                    source_uri=file_row.minio_key,
                    content_hash=content_hash,
                    document_metadata=doc_meta,
                    topic_node_id=topic_node_id,
                    folder_id=folder_id,
                    uploaded_by=uploaded_by,
                    visibility_scope=vis_scope,
                    folder_path=str(folder_path) if folder_path else None,
                    session_factory=rag_factory,
                )
                file_row.ingestion_status = "ready"
            except Exception:
                file_row.ingestion_status = "failed"
                raise
            finally:
                await db.commit()


@celery_app.task(name="ingest_file")
def ingest_file(file_id: str) -> None:
    asyncio.run(_ingest_async(UUID(file_id)))
