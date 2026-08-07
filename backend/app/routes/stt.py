"""Lightweight speech-to-text for in-app dictation (no file persistence)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File as UploadFileParam, HTTPException, UploadFile, status

from app.auth.dependencies import get_current_user
from app.models import User
from app.services.stt import STTError, transcribe_audio_bytes

router = APIRouter(prefix="/api/stt", tags=["stt"])


@router.post("/transcribe")
async def transcribe_dictation(
    audio: UploadFile = UploadFileParam(...),
    _user: User = Depends(get_current_user),
):
    raw = await audio.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Empty audio",
        )
    try:
        transcript = await transcribe_audio_bytes(
            audio.filename or "dictation.webm",
            raw,
            audio.content_type or "audio/webm",
        )
    except STTError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="STT service failed",
        ) from exc
    return {"transcript": transcript}
