from __future__ import annotations

from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File as UploadFileParam, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.config import settings
from app.models import User, get_db
from app.models.capture_session import CaptureAsset, CaptureSession
from app.models.file import File as FileModel
from app.schemas.capture import (
    CaptureAssetResponse,
    CaptureSessionCreate,
    CaptureSessionResponse,
    CaptureSessionUpdate,
)
from app.services.file_service import new_file_id, upload_bytes
from app.services.folders import ensure_default_uploads_folder
from app.services.ingestion import ingest_file

router = APIRouter(prefix="/api/capture", tags=["capture"])


def _session_response(row: CaptureSession) -> CaptureSessionResponse:
    return CaptureSessionResponse(
        id=row.id,
        user_id=row.user_id,
        kind=row.kind,
        title=row.title,
        status=row.status,
        project_id=row.project_id,
        topic_node_id=row.topic_node_id,
        transcript=row.transcript,
        is_private=row.is_private,
        metadata=row.session_metadata or {},
        created_at=row.created_at,
        ended_at=row.ended_at,
    )


@router.get("/sessions", response_model=list[CaptureSessionResponse])
async def list_sessions(
    kind: str | None = Query(default=None),
    project_id: UUID | None = Query(default=None),
    topic_node_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(CaptureSession)
        .where(CaptureSession.user_id == current_user.id)
        .order_by(CaptureSession.created_at.desc())
    )
    if kind is not None:
        stmt = stmt.where(CaptureSession.kind == kind)
    if project_id is not None:
        stmt = stmt.where(CaptureSession.project_id == project_id)
    if topic_node_id is not None:
        stmt = stmt.where(CaptureSession.topic_node_id == topic_node_id)
    result = await db.execute(stmt)
    return [_session_response(r) for r in result.scalars().all()]


@router.post("/sessions", response_model=CaptureSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: CaptureSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.kind not in ("spoken", "camera"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid kind")
    row = CaptureSession(
        user_id=current_user.id,
        kind=body.kind,
        title=body.title.strip() or ("Spoken session" if body.kind == "spoken" else "Camera session"),
        project_id=body.project_id,
        topic_node_id=body.topic_node_id,
        is_private=body.is_private,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _session_response(row)


@router.get("/sessions/{session_id}", response_model=CaptureSessionResponse)
async def get_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_session(db, session_id, current_user.id)
    return _session_response(row)


@router.patch("/sessions/{session_id}", response_model=CaptureSessionResponse)
async def update_session(
    session_id: UUID,
    body: CaptureSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_session(db, session_id, current_user.id)
    if body.title is not None:
        row.title = body.title.strip() or row.title
    if body.status is not None:
        row.status = body.status
        if body.status == "completed" and row.ended_at is None:
            from datetime import datetime, timezone

            row.ended_at = datetime.now(timezone.utc)
    if body.project_id is not None:
        row.project_id = body.project_id
    if body.topic_node_id is not None:
        row.topic_node_id = body.topic_node_id
    if body.is_private is not None:
        row.is_private = body.is_private
    if body.transcript is not None:
        row.transcript = body.transcript
    await db.commit()
    await db.refresh(row)
    return _session_response(row)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_session(db, session_id, current_user.id)
    await db.delete(row)
    await db.commit()


@router.post("/sessions/{session_id}/chunks")
async def append_spoken_chunk(
    session_id: UUID,
    audio: UploadFile = UploadFileParam(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_session(db, session_id, current_user.id)
    if row.kind != "spoken":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a spoken session")

    raw = await audio.read()
    if not raw:
        return {"transcript": row.transcript, "delta": ""}

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.stt_url.rstrip('/')}/transcribe",
            files={
                "audio": (audio.filename or "chunk.webm", raw, audio.content_type or "audio/webm"),
            },
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="STT service failed")

    payload = resp.json()
    delta = (payload.get("text") or payload.get("transcript") or "").strip()
    if delta:
        row.transcript = f"{row.transcript} {delta}".strip() if row.transcript else delta
        await db.commit()
    return {"transcript": row.transcript, "delta": delta}


@router.get("/sessions/{session_id}/assets", response_model=list[CaptureAssetResponse])
async def list_assets(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_session(db, session_id, current_user.id)
    result = await db.execute(
        select(CaptureAsset).where(CaptureAsset.session_id == session_id)
    )
    return list(result.scalars().all())


@router.post(
    "/sessions/{session_id}/assets",
    response_model=CaptureAssetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_camera_asset(
    session_id: UUID,
    image: UploadFile = UploadFileParam(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_session(db, session_id, current_user.id)
    if row.kind != "camera":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a camera session")

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty image")

    if row.project_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Allocate this session to a project before adding images",
        )

    file_id = new_file_id()
    filename = image.filename or "capture.jpg"
    project_id = row.project_id
    folder = await ensure_default_uploads_folder(db, project_id)
    metadata: dict[str, object] = {
        "source": "camera_capture",
        "capture_session_id": str(row.id),
        "folder_id": str(folder.id),
        "folder_path": folder.path,
    }
    if row.topic_node_id is not None:
        metadata["topic_node_id"] = str(row.topic_node_id)
    key = upload_bytes(project_id, file_id, filename, raw, image.content_type or "image/jpeg")
    file_row = FileModel(
        id=file_id,
        project_id=project_id,
        folder_id=folder.id,
        uploaded_by=current_user.id,
        filename=filename,
        file_type=image.content_type,
        file_size_bytes=len(raw),
        minio_key=key,
        ingestion_status="pending",
        file_metadata=metadata,
        is_private=row.is_private,
    )
    db.add(file_row)
    ingest_file.delay(str(file_row.id))

    asset = CaptureAsset(session_id=row.id, file_id=file_id)
    db.add(asset)
    meta = dict(row.session_metadata or {})
    meta["asset_count"] = int(meta.get("asset_count", 0)) + 1
    row.session_metadata = meta
    await db.commit()
    await db.refresh(asset)
    return asset


async def _get_owned_session(
    db: AsyncSession, session_id: UUID, user_id: UUID
) -> CaptureSession:
    row = await db.get(CaptureSession, session_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return row
