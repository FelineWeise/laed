"""Text extraction, chunking, and Celery ingest task."""

from __future__ import annotations

import asyncio
import hashlib
from io import BytesIO
from uuid import UUID

from app.config import settings
from app.models.base import async_session
from app.models.file import File
from app.models.folder import Folder
from app.models.project import Project
from app.services.file_service import download_bytes
from app.services.rag_registry import EMBEDDING_DIM_NOMIC, ensure_rag_project
from app.services.retrieval.retriever import ChunkIn, RagRetriever, rag_session_factory
from app.services.rag import DEFAULT_CHUNKS_TABLE
from app.worker import celery_app

CHUNKS_TABLE = DEFAULT_CHUNKS_TABLE

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

            project = await db.get(Project, file_row.project_id)
            project_name = project.name if project else str(file_row.project_id)

            if settings.rag_database_url and settings.laed_tenant_id:
                factory = rag_session_factory()
                async with factory() as rag_session:
                    await ensure_rag_project(
                        rag_session,
                        tenant_id=settings.laed_tenant_id,
                        project_id=str(file_row.project_id),
                        name=project_name,
                        embedding_model=settings.embedding_model,
                        embedding_dim=EMBEDDING_DIM_NOMIC,
                    )

            if not settings.rag_database_url or not settings.laed_tenant_id:
                raise RuntimeError("RAG not configured")

            retriever = RagRetriever(
                tenant_id=settings.laed_tenant_id,
                project_id=str(file_row.project_id),
                embedding_model=settings.embedding_model,
                chunks_table=CHUNKS_TABLE,
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
                    "visibility_scope": "private" if file_row.is_private else "project",
                    "source": "file",
                }
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
                visibility_scope="private" if file_row.is_private else "project",
                folder_path=str(folder_path) if folder_path else None,
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
