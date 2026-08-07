"""Promote capture session blobs to project files when shared."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.capture_session import CaptureAsset, CaptureSession
from app.models.file import File as FileModel
from app.services.capture_transcript_ingest import sync_spoken_transcript_file
from app.services.file_service import download_bytes, new_file_id, upload_bytes
from app.services.file_visibility import apply_file_visibility
from app.services.folders import ensure_default_uploads_folder

logger = logging.getLogger(__name__)


async def sync_capture_session_to_project(
    db: AsyncSession,
    row: CaptureSession,
    *,
    uploaded_by: UUID,
) -> None:
    """Link user-scoped capture assets to project files when session has a project."""
    if row.project_id is None:
        return

    result = await db.execute(
        select(CaptureAsset).where(CaptureAsset.session_id == row.id)
    )
    assets = list(result.scalars().all())
    folder = await ensure_default_uploads_folder(db, row.project_id)

    for asset in assets:
        if asset.file_id is not None:
            file_row = await db.get(FileModel, asset.file_id)
            if file_row is not None:
                await apply_file_visibility(
                    db,
                    file_row,
                    is_private=row.is_private,
                    share_with_user_ids=None,
                    trigger_ingest=True,
                )
            continue

        key = asset.derived_minio_key or asset.minio_key
        if not key:
            continue

        filename = asset.filename or "capture.bin"
        content_type = asset.content_type or "application/octet-stream"
        raw = download_bytes(key)

        file_id = new_file_id()
        metadata: dict[str, object] = {
            "source": "capture_asset",
            "capture_session_id": str(row.id),
            "capture_asset_id": str(asset.id),
            "folder_id": str(folder.id),
            "folder_path": folder.path,
        }
        if row.topic_node_id is not None:
            metadata["topic_node_id"] = str(row.topic_node_id)

        minio_key = upload_bytes(
            row.project_id,
            file_id,
            filename,
            raw,
            content_type,
        )
        file_row = FileModel(
            id=file_id,
            project_id=row.project_id,
            folder_id=folder.id,
            uploaded_by=uploaded_by,
            filename=filename,
            file_type=content_type,
            file_size_bytes=len(raw),
            minio_key=minio_key,
            ingestion_status="pending",
            file_metadata=metadata,
            is_private=row.is_private,
        )
        db.add(file_row)
        await db.flush()
        asset.file_id = file_id
        await apply_file_visibility(
            db,
            file_row,
            is_private=row.is_private,
            share_with_user_ids=None,
            trigger_ingest=True,
        )

    if row.kind == "spoken":
        await sync_spoken_transcript_file(db, row, uploaded_by=uploaded_by)

    logger.info("Synced capture session %s to project %s", row.id, row.project_id)


async def sync_capture_asset_to_project(
    db: AsyncSession,
    asset: CaptureAsset,
    session: CaptureSession,
    *,
    project_id: UUID,
    uploaded_by: UUID,
    is_private: bool,
    share_with_user_ids: list[UUID] | None = None,
) -> FileModel:
    """Promote a single capture asset into a project file with visibility + grants."""
    folder = await ensure_default_uploads_folder(db, project_id)

    if asset.file_id is not None:
        file_row = await db.get(FileModel, asset.file_id)
        if file_row is not None:
            file_row.project_id = project_id
            await apply_file_visibility(
                db,
                file_row,
                is_private=is_private,
                share_with_user_ids=share_with_user_ids,
                trigger_ingest=True,
            )
            return file_row

    key = asset.derived_minio_key or asset.minio_key
    if not key:
        raise ValueError("Asset has no stored blob")

    filename = asset.filename or "capture.bin"
    content_type = asset.content_type or "application/octet-stream"
    raw = download_bytes(key)
    file_id = new_file_id()
    metadata: dict[str, object] = {
        "source": "capture_asset",
        "capture_session_id": str(session.id),
        "capture_asset_id": str(asset.id),
        "folder_id": str(folder.id),
        "folder_path": folder.path,
    }
    if session.topic_node_id is not None:
        metadata["topic_node_id"] = str(session.topic_node_id)

    minio_key = upload_bytes(project_id, file_id, filename, raw, content_type)
    file_row = FileModel(
        id=file_id,
        project_id=project_id,
        folder_id=folder.id,
        uploaded_by=uploaded_by,
        filename=filename,
        file_type=content_type,
        file_size_bytes=len(raw),
        minio_key=minio_key,
        ingestion_status="pending",
        file_metadata=metadata,
        is_private=is_private,
    )
    db.add(file_row)
    await db.flush()
    asset.file_id = file_id
    await apply_file_visibility(
        db,
        file_row,
        is_private=is_private,
        share_with_user_ids=share_with_user_ids,
        trigger_ingest=True,
    )
    return file_row
