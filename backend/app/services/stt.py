"""Speech-to-text via the LLM gateway.

Single front door: all STT goes through the gateway's OpenAI-compatible route
(`POST {LLM_GATEWAY_URL}/audio/transcriptions`, model `stt/parakeet`), which proxies
to the self-hosted Parakeet model server. laed no longer talks to Parakeet directly.

Browser MediaRecorder often uploads WebM; we normalize to 16 kHz mono WAV in-app
before the gateway call so Parakeet's ffmpeg step receives a complete, valid file.
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.services.capture_media import audio_to_wav_16k_mono, suffix_for_mime

logger = logging.getLogger(__name__)

# Gateway model id for the self-hosted Parakeet STT deployment.
STT_MODEL = "stt/parakeet"


class STTError(Exception):
    """Raised when the gateway STT call fails (non-2xx response)."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _prepare_for_gateway(
    filename: str, data: bytes, content_type: str
) -> tuple[str, bytes, str]:
    """Return (filename, bytes, content_type) ready for Parakeet."""
    ct = (content_type or "").lower()
    name = (filename or "audio.bin").lower()
    if ct.startswith("audio/wav") or ct == "audio/x-wav" or name.endswith(".wav"):
        return filename or "audio.wav", data, "audio/wav"

    suffix = suffix_for_mime(content_type)
    if suffix == ".bin":
        if name.endswith(".webm"):
            suffix = ".webm"
        elif name.endswith(".ogg"):
            suffix = ".ogg"
        elif name.endswith(".mp4") or name.endswith(".m4a"):
            suffix = ".mp4"
        else:
            suffix = ".webm"

    try:
        wav = audio_to_wav_16k_mono(data, source_suffix=suffix)
        return "chunk.wav", wav, "audio/wav"
    except Exception as exc:
        logger.warning("STT wav normalize failed (%s); forwarding original", exc)
        return filename or f"chunk{suffix}", data, content_type or "application/octet-stream"


async def transcribe_audio_bytes(
    filename: str,
    data: bytes,
    content_type: str,
    *,
    timeout: float = 120.0,
) -> str:
    """Transcribe audio bytes through the gateway and return the transcript text.

    Raises STTError on a non-2xx gateway response. Returns "" for an empty transcript.
    """
    if not data:
        return ""

    out_name, out_data, out_type = _prepare_for_gateway(filename, data, content_type)

    url = f"{settings.llm_gateway_url.rstrip('/')}/audio/transcriptions"
    headers: dict[str, str] = {}
    if settings.llm_gateway_key:
        headers["Authorization"] = f"Bearer {settings.llm_gateway_key}"

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            url,
            headers=headers,
            files={"file": (out_name, out_data, out_type)},
            data={"model": STT_MODEL},
        )

    if resp.status_code >= 400:
        raise STTError(resp.status_code, resp.text[:500])

    payload = resp.json()
    return (payload.get("text") or payload.get("transcript") or "").strip()
