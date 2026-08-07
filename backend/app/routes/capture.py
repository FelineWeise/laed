from __future__ import annotations

import logging
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File as UploadFileParam,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy import select, or_, and_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.access import has_project_access
from app.models import User, get_db
from app.models.capture_session import CaptureAsset, CaptureSession
from app.models.file import File as FileModel
from app.models.project import ProjectMember
from app.schemas.capture import (
    CaptureAssetResponse,
    CaptureAssetUpdate,
    CaptureSessionCreate,
    CaptureSessionResponse,
    CaptureSessionUpdate,
)
from app.services.capture_media import (
    classify_upload,
    normalize_image,
    suffix_for_mime,
    transcode_audio_to_mp3,
    transcode_video_to_mp4,
)
from app.services.capture_session_sync import (
    sync_capture_asset_to_project,
    sync_capture_session_to_project,
)
from app.services.capture_transcript_ingest import sync_spoken_transcript_file
from app.services.file_service import download_bytes, upload_user_capture_bytes
from app.services.stt import STTError, transcribe_audio_bytes
router = APIRouter(prefix="/api/capture", tags=["capture"])
logger = logging.getLogger(__name__)

VALID_CAPTURE_MODES = frozenset({"photo", "scan", "video", "audio"})


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


async def _asset_response(
    db: AsyncSession, asset: CaptureAsset
) -> CaptureAssetResponse:
    # Browser-facing URL must go through the API (auth + proxy). Presigned MinIO
    # URLs use the internal hostname `minio:9000` and are unusable in the client.
    key = asset.derived_minio_key or asset.minio_key
    url = (
        f"/api/capture/sessions/{asset.session_id}/assets/{asset.id}/download"
        if key
        else None
    )
    project_id: UUID | None = None
    is_private = True
    if asset.file_id is not None:
        file_row = await db.get(FileModel, asset.file_id)
        if file_row is not None:
            project_id = file_row.project_id
            is_private = bool(file_row.is_private)
    return CaptureAssetResponse(
        id=asset.id,
        session_id=asset.session_id,
        file_id=asset.file_id,
        filename=asset.filename,
        content_type=asset.content_type,
        asset_kind=asset.asset_kind,
        download_url=url,
        transcoded=bool(asset.derived_minio_key),
        project_id=project_id,
        is_private=is_private,
        created_at=asset.created_at,
    )


def _apply_capture_mode(row: CaptureSession, mode: str | None) -> None:
    if mode is None:
        return
    normalized = mode.strip().lower()
    if normalized not in VALID_CAPTURE_MODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid capture_mode",
        )
    meta = dict(row.session_metadata or {})
    meta["capture_mode"] = normalized
    row.session_metadata = meta


async def _sync_transcript_assets(
    db: AsyncSession, row: CaptureSession
) -> None:
    transcript = (row.transcript or "").strip()
    if not transcript:
        return
    base = f"spoken-{str(row.id)[:8]}"
    for ext, mime in (
        (".txt", "text/plain; charset=utf-8"),
        (".md", "text/markdown; charset=utf-8"),
    ):
        body = transcript.encode("utf-8")
        if ext == ".md":
            body = f"# Transcript\n\n{transcript}".encode("utf-8")
        filename = f"{base}{ext}"
        result = await db.execute(
            select(CaptureAsset).where(
                CaptureAsset.session_id == row.id,
                CaptureAsset.filename == filename,
            )
        )
        existing = result.scalars().first()
        if existing is not None:
            asset_id = existing.id
        else:
            asset_id = uuid4()
            existing = CaptureAsset(
                id=asset_id,
                session_id=row.id,
                asset_kind="transcript",
                filename=filename,
                content_type=mime,
                source_mime=mime,
            )
            db.add(existing)
        key = upload_user_capture_bytes(
            row.user_id,
            row.id,
            asset_id,
            filename,
            body,
            mime,
        )
        existing.minio_key = key
        existing.content_type = mime
        existing.derived_minio_key = None


async def _store_media_asset(
    db: AsyncSession,
    row: CaptureSession,
    *,
    raw: bytes,
    filename: str,
    content_type: str | None,
    asset_kind: str,
) -> CaptureAsset:
    asset_id = uuid4()
    source_mime = content_type or "application/octet-stream"
    suffix = suffix_for_mime(source_mime)
    if not filename or filename == "blob":
        filename = f"capture-{str(asset_id)[:8]}{suffix}"

    minio_key = upload_user_capture_bytes(
        row.user_id,
        row.id,
        asset_id,
        filename,
        raw,
        source_mime,
    )

    derived_key: str | None = None
    out_name = filename
    out_type = source_mime

    try:
        if asset_kind == "video":
            mp4, out_type = transcode_video_to_mp4(raw, suffix)
            out_name = f"{_path_stem(filename)}.mp4"
            derived_key = upload_user_capture_bytes(
                row.user_id, row.id, asset_id, out_name, mp4, out_type
            )
        elif asset_kind == "audio":
            mp3, out_type = transcode_audio_to_mp3(raw, suffix)
            out_name = f"{_path_stem(filename)}.mp3"
            derived_key = upload_user_capture_bytes(
                row.user_id, row.id, asset_id, out_name, mp3, out_type
            )
        elif asset_kind == "image":
            jpeg, out_type, out_name = normalize_image(raw, prefer_jpeg=True)
            derived_key = upload_user_capture_bytes(
                row.user_id, row.id, asset_id, out_name, jpeg, out_type
            )
    except Exception as exc:
        logger.warning("Transcode failed session=%s kind=%s: %s", row.id, asset_kind, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Media transcoding failed. Retry the capture.",
        ) from exc

    if derived_key is None and asset_kind in ("video", "audio", "image"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Media transcoding failed. Retry the capture.",
        )

    asset = CaptureAsset(
        id=asset_id,
        session_id=row.id,
        minio_key=minio_key,
        derived_minio_key=derived_key,
        filename=out_name if derived_key else filename,
        content_type=out_type if derived_key else source_mime,
        source_mime=source_mime,
        asset_kind=asset_kind,
    )
    db.add(asset)
    meta = dict(row.session_metadata or {})
    meta["asset_count"] = int(meta.get("asset_count", 0)) + 1
    row.session_metadata = meta
    return asset


def _path_stem(name: str) -> str:
    if "." in name:
        return name.rsplit(".", 1)[0]
    return name


@router.get("/sessions", response_model=list[CaptureSessionResponse])
async def list_sessions(
    kind: str | None = Query(default=None),
    project_id: UUID | None = Query(default=None),
    topic_node_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    shared_visible = and_(
        CaptureSession.is_private.is_(False),
        CaptureSession.project_id.isnot(None),
        exists(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == CaptureSession.project_id,
                ProjectMember.user_id == current_user.id,
            )
        ),
    )
    stmt = (
        select(CaptureSession)
        .where(or_(CaptureSession.user_id == current_user.id, shared_visible))
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
    if body.project_id is not None and not await has_project_access(
        db, body.project_id, current_user.id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
    row = CaptureSession(
        user_id=current_user.id,
        kind=body.kind,
        title=body.title.strip()
        or ("Spoken session" if body.kind == "spoken" else "Camera session"),
        project_id=body.project_id,
        topic_node_id=body.topic_node_id,
        is_private=body.is_private,
    )
    if body.capture_mode:
        _apply_capture_mode(row, body.capture_mode)
    elif body.kind == "spoken":
        _apply_capture_mode(row, "audio")
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
    row = await _get_accessible_session(db, session_id, current_user.id)
    return _session_response(row)


@router.patch("/sessions/{session_id}", response_model=CaptureSessionResponse)
async def update_session(
    session_id: UUID,
    body: CaptureSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_session(db, session_id, current_user.id)
    prev_private = row.is_private
    patch = body.model_dump(exclude_unset=True)
    if "title" in patch and patch["title"] is not None:
        row.title = patch["title"].strip() or row.title
    if "status" in patch and patch["status"] is not None:
        row.status = patch["status"]
        if patch["status"] == "completed" and row.ended_at is None:
            from datetime import datetime, timezone

            row.ended_at = datetime.now(timezone.utc)
    if "project_id" in patch:
        pid = patch["project_id"]
        if pid is not None and not await has_project_access(db, pid, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
        row.project_id = pid
    if "topic_node_id" in patch:
        row.topic_node_id = patch["topic_node_id"]
    if "is_private" in patch and patch["is_private"] is not None:
        row.is_private = patch["is_private"]
    if "transcript" in patch and patch["transcript"] is not None:
        row.transcript = patch["transcript"]
    if "capture_mode" in patch:
        _apply_capture_mode(row, patch["capture_mode"])
    await db.commit()
    await db.refresh(row)

    if row.project_id is not None:
        await sync_capture_session_to_project(db, row, uploaded_by=current_user.id)
        await db.commit()
        await db.refresh(row)
    elif prev_private and not row.is_private and row.kind == "spoken":
        await sync_spoken_transcript_file(db, row, uploaded_by=current_user.id)
        await db.commit()
        await db.refresh(row)

    if row.transcript:
        await _sync_transcript_assets(db, row)
        await db.commit()

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
        return {"transcript": row.transcript, "delta": "", "stt_ok": True}

    try:
        delta = await transcribe_audio_bytes(
            audio.filename or "chunk.webm", raw, audio.content_type or "audio/webm"
        )
    except STTError as exc:
        logger.warning(
            "STT request failed session=%s status=%s body=%s",
            session_id,
            exc.status_code,
            exc.detail,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="STT service failed")

    if delta:
        row.transcript = f"{row.transcript} {delta}".strip() if row.transcript else delta
        await db.commit()
    return {"transcript": row.transcript, "delta": delta, "stt_ok": True}


@router.post("/sessions/{session_id}/finalize-audio", response_model=CaptureAssetResponse)
async def finalize_audio(
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio")

    _apply_capture_mode(row, "audio")
    asset = await _store_media_asset(
        db,
        row,
        raw=raw,
        filename=audio.filename or "recording.webm",
        content_type=audio.content_type or "audio/webm",
        asset_kind="audio",
    )
    await _sync_transcript_assets(db, row)
    await db.commit()
    await db.refresh(asset)
    if row.project_id is not None:
        await sync_capture_session_to_project(db, row, uploaded_by=current_user.id)
        await db.commit()
    return await _asset_response(db, asset)


@router.get("/sessions/{session_id}/assets", response_model=list[CaptureAssetResponse])
async def list_assets(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_accessible_session(db, session_id, current_user.id)
    result = await db.execute(
        select(CaptureAsset).where(CaptureAsset.session_id == session_id)
    )
    assets = list(result.scalars().all())
    return [await _asset_response(db, a) for a in assets]


@router.patch("/assets/{asset_id}", response_model=CaptureAssetResponse)
async def update_asset(
    asset_id: UUID,
    body: CaptureAssetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    asset = await db.get(CaptureAsset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    session = await _get_owned_session(db, asset.session_id, current_user.id)

    patch = body.model_dump(exclude_unset=True)
    share_ids = patch.get("share_with_user_ids")
    if "project_id" in patch and patch["project_id"] is not None:
        pid = patch["project_id"]
        if not await has_project_access(db, pid, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
        # Default attach visibility: Private (Idea 1)
        is_private = True if patch.get("is_private") is None else bool(patch["is_private"])
        try:
            await sync_capture_asset_to_project(
                db,
                asset,
                session,
                project_id=pid,
                uploaded_by=current_user.id,
                is_private=is_private,
                share_with_user_ids=share_ids if not is_private else [],
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
    elif ("is_private" in patch or "share_with_user_ids" in patch) and asset.file_id is not None:
        from app.services.file_visibility import apply_file_visibility

        file_row = await db.get(FileModel, asset.file_id)
        if file_row is not None:
            is_private = (
                file_row.is_private if patch.get("is_private") is None else bool(patch["is_private"])
            )
            await apply_file_visibility(
                db,
                file_row,
                is_private=is_private,
                share_with_user_ids=share_ids if not is_private else [],
                trigger_ingest=True,
            )

    await db.commit()
    await db.refresh(asset)
    return await _asset_response(db, asset)


@router.get("/sessions/{session_id}/assets/{asset_id}/download")
async def download_asset(
    session_id: UUID,
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_accessible_session(db, session_id, current_user.id)
    asset = await db.get(CaptureAsset, asset_id)
    if not asset or asset.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    key = asset.derived_minio_key or asset.minio_key
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No blob for asset")
    data = download_bytes(key)
    filename = asset.filename or "capture.bin"
    media_type = asset.content_type or "application/octet-stream"
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=300",
        },
    )


@router.post(
    "/sessions/{session_id}/assets",
    response_model=CaptureAssetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_camera_asset(
    session_id: UUID,
    image: UploadFile = UploadFileParam(...),
    media_role: str | None = Form(default=None),
    capture_mode: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    upload = image
    row = await _get_owned_session(db, session_id, current_user.id)
    if row.kind != "camera":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a camera session")

    raw = await upload.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload")

    filename = upload.filename or "capture.bin"
    content_type = upload.content_type
    asset_kind = classify_upload(content_type, filename, media_role=media_role)
    if capture_mode:
        _apply_capture_mode(row, capture_mode)
    elif asset_kind == "video":
        _apply_capture_mode(row, "video")
    elif (row.session_metadata or {}).get("capture_mode") is None:
        _apply_capture_mode(row, "photo")

    asset = await _store_media_asset(
        db,
        row,
        raw=raw,
        filename=filename,
        content_type=content_type,
        asset_kind=asset_kind,
    )
    await db.commit()
    await db.refresh(asset)
    if row.project_id is not None:
        await sync_capture_session_to_project(db, row, uploaded_by=current_user.id)
        await db.commit()
        await db.refresh(asset)
    return await _asset_response(db, asset)


async def _get_owned_session(
    db: AsyncSession, session_id: UUID, user_id: UUID
) -> CaptureSession:
    row = await db.get(CaptureSession, session_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return row


async def _get_accessible_session(
    db: AsyncSession, session_id: UUID, user_id: UUID
) -> CaptureSession:
    row = await db.get(CaptureSession, session_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if row.user_id == user_id:
        return row
    if (
        not row.is_private
        and row.project_id is not None
        and await has_project_access(db, row.project_id, user_id)
    ):
        return row
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
