from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.capture_session import CaptureSession
from app.models.file import File as FileModel
from app.services.file_service import new_file_id, upload_bytes
from app.services.file_visibility import apply_file_visibility
from app.services.folders import ensure_default_uploads_folder

logger = logging.getLogger(__name__)


async def _find_transcript_file(
    db: AsyncSession, session_id: UUID, project_id: UUID
) -> FileModel | None:
    result = await db.execute(
        select(FileModel).where(
            FileModel.project_id == project_id,
            FileModel.file_metadata["capture_session_id"].astext == str(session_id),
            FileModel.file_metadata["source"].astext == "spoken_transcript",
        )
    )
    return result.scalars().first()


async def _upsert_private_transcript_file(
    db: AsyncSession,
    row: CaptureSession,
    *,
    uploaded_by: UUID,
    transcript: str,
) -> None:
    if row.project_id is None:
        return
    filename = f"spoken-{str(row.id)[:8]}.txt"
    raw = transcript.encode("utf-8")
    folder = await ensure_default_uploads_folder(db, row.project_id)
    file_id = new_file_id()
    metadata: dict[str, object] = {
        "source": "spoken_transcript",
        "capture_session_id": str(row.id),
        "folder_id": str(folder.id),
        "folder_path": folder.path,
    }
    if row.topic_node_id is not None:
        metadata["topic_node_id"] = str(row.topic_node_id)
    key = upload_bytes(
        row.project_id,
        file_id,
        filename,
        raw,
        "text/plain; charset=utf-8",
    )
    file_row = FileModel(
        id=file_id,
        project_id=row.project_id,
        folder_id=folder.id,
        uploaded_by=uploaded_by,
        filename=filename,
        file_type="text/plain",
        file_size_bytes=len(raw),
        minio_key=key,
        ingestion_status="pending",
        file_metadata=metadata,
        is_private=True,
    )
    db.add(file_row)


async def sync_spoken_transcript_file(
    db: AsyncSession,
    row: CaptureSession,
    *,
    uploaded_by: UUID,
) -> None:
    """Create or update a transcript file when a spoken session is shared."""
    if row.kind != "spoken" or row.project_id is None:
        return

    existing = await _find_transcript_file(db, row.id, row.project_id)
    transcript = (row.transcript or "").strip()

    if row.is_private:
        if existing is not None:
            await apply_file_visibility(
                db,
                existing,
                is_private=True,
                share_with_user_ids=[],
                trigger_ingest=True,
            )
        elif transcript:
            await _upsert_private_transcript_file(
                db, row, uploaded_by=uploaded_by, transcript=transcript
            )
        return

    if not transcript:
        return

    filename = f"spoken-{str(row.id)[:8]}.txt"
    raw = transcript.encode("utf-8")

    if existing is not None:
        existing.filename = filename
        existing.file_size_bytes = len(raw)
        key = upload_bytes(
            row.project_id,
            existing.id,
            filename,
            raw,
            "text/plain; charset=utf-8",
        )
        existing.minio_key = key
        await apply_file_visibility(
            db,
            existing,
            is_private=False,
            share_with_user_ids=None,
            trigger_ingest=True,
        )
        return

    folder = await ensure_default_uploads_folder(db, row.project_id)
    file_id = new_file_id()
    metadata: dict[str, object] = {
        "source": "spoken_transcript",
        "capture_session_id": str(row.id),
        "folder_id": str(folder.id),
        "folder_path": folder.path,
    }
    if row.topic_node_id is not None:
        metadata["topic_node_id"] = str(row.topic_node_id)

    key = upload_bytes(
        row.project_id,
        file_id,
        filename,
        raw,
        "text/plain; charset=utf-8",
    )
    file_row = FileModel(
        id=file_id,
        project_id=row.project_id,
        folder_id=folder.id,
        uploaded_by=uploaded_by,
        filename=filename,
        file_type="text/plain",
        file_size_bytes=len(raw),
        minio_key=key,
        ingestion_status="pending",
        file_metadata=metadata,
        is_private=False,
    )
    db.add(file_row)
    await db.flush()
    await apply_file_visibility(
        db,
        file_row,
        is_private=False,
        share_with_user_ids=None,
        trigger_ingest=True,
    )
    logger.info("Created spoken transcript file session=%s file=%s", row.id, file_id)
