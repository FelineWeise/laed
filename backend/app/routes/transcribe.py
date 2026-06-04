from __future__ import annotations

from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File as UploadFileParam, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.config import settings
from app.models import User, ProjectMember, get_db
from app.models.file import File as FileModel
from app.services.file_service import new_file_id, upload_bytes
from app.services.ingestion import ingest_file

router = APIRouter(prefix="/api/projects", tags=["transcribe"])


@router.post("/{project_id}/transcribe", status_code=status.HTTP_201_CREATED)
async def transcribe_audio(
    project_id: UUID,
    audio: UploadFile = UploadFileParam(...),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    raw = await audio.read()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.stt_url.rstrip('/')}/transcribe",
            files={"audio": (audio.filename or "audio.wav", raw, audio.content_type or "audio/wav")},
        )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="STT service failed",
        )
    payload = resp.json()
    transcript = payload.get("text") or payload.get("transcript") or ""
    if not transcript:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Empty transcript")

    file_id = new_file_id()
    filename = f"{audio.filename or 'recording'}.txt"
    text_bytes = transcript.encode("utf-8")
    key = upload_bytes(project_id, file_id, filename, text_bytes, "text/plain")
    row = FileModel(
        id=file_id,
        project_id=project_id,
        uploaded_by=current_user.id,
        filename=filename,
        file_type="text/plain",
        file_size_bytes=len(text_bytes),
        minio_key=key,
        ingestion_status="pending",
        file_metadata={"source": "transcribe"},
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    ingest_file.delay(str(row.id))
    return {"file_id": str(row.id), "transcript": transcript, "ingestion_status": row.ingestion_status}
