"""Transcode capture uploads (ffmpeg) and classify media types."""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def classify_upload(
    content_type: str | None,
    filename: str,
    *,
    media_role: str | None = None,
) -> str:
    """Return asset_kind: image | video | audio.

    Prefer explicit media_role when provided (needed for ambiguous .webm).
    """
    role = (media_role or "").strip().lower()
    if role in ("image", "video", "audio"):
        return role

    ct = (content_type or "").lower()
    name = filename.lower()
    if ct.startswith("audio/"):
        return "audio"
    if ct.startswith("video/"):
        return "video"
    if ct.startswith("image/"):
        return "image"
    if name.endswith((".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac")):
        return "audio"
    if name.endswith((".mp4", ".mov", ".mkv", ".avi")):
        return "video"
    if name.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic")):
        return "image"
    # Ambiguous container (e.g. .webm) without role → video default for camera uploads
    if name.endswith(".webm"):
        return "video"
    return "image"


def _run_ffmpeg(cmd: list[str], *, timeout: int) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=timeout)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        logger.warning("ffmpeg failed: %s", exc)
        raise


def transcode_video_to_mp4(source: bytes, source_suffix: str = ".webm") -> tuple[bytes, str]:
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"in{source_suffix}"
        dst = Path(tmp) / "out.mp4"
        src.write_bytes(source)
        cmd = [
            "ffmpeg",
            "-y",
            "-fflags",
            "+genpts",
            "-i",
            str(src),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(dst),
        ]
        try:
            _run_ffmpeg(cmd, timeout=300)
        except Exception:
            # Retry with remux-friendly flags
            cmd_retry = [
                "ffmpeg",
                "-y",
                "-err_detect",
                "ignore_err",
                "-i",
                str(src),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(dst),
            ]
            _run_ffmpeg(cmd_retry, timeout=300)
        if not dst.is_file():
            raise RuntimeError("ffmpeg produced no video output")
        return dst.read_bytes(), "video/mp4"


def transcode_audio_to_mp3(source: bytes, source_suffix: str = ".webm") -> tuple[bytes, str]:
    """Encode audio to MP3 for broad device playback."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"in{source_suffix}"
        dst = Path(tmp) / "out.mp3"
        src.write_bytes(source)
        cmd = [
            "ffmpeg",
            "-y",
            "-fflags",
            "+genpts",
            "-i",
            str(src),
            "-vn",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(dst),
        ]
        try:
            _run_ffmpeg(cmd, timeout=300)
        except Exception:
            cmd_retry = [
                "ffmpeg",
                "-y",
                "-err_detect",
                "ignore_err",
                "-i",
                str(src),
                "-vn",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "192k",
                str(dst),
            ]
            _run_ffmpeg(cmd_retry, timeout=300)
        if not dst.is_file():
            raise RuntimeError("ffmpeg produced no audio output")
        return dst.read_bytes(), "audio/mpeg"


def normalize_image(
    source: bytes, *, prefer_jpeg: bool = True
) -> tuple[bytes, str, str]:
    """Convert image bytes to JPEG or PNG via ffmpeg."""
    suffix = ".jpg" if prefer_jpeg else ".png"
    content_type = "image/jpeg" if prefer_jpeg else "image/png"
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in"
        src.write_bytes(source)
        dst = Path(tmp) / f"out{suffix}"
        cmd = ["ffmpeg", "-y", "-i", str(src), str(dst)]
        _run_ffmpeg(cmd, timeout=120)
        if not dst.is_file():
            raise RuntimeError("ffmpeg produced no image output")
        return dst.read_bytes(), content_type, f"capture{suffix}"


def audio_to_wav_16k_mono(source: bytes, source_suffix: str = ".webm") -> bytes:
    """Normalize any browser recording to 16 kHz mono WAV for Parakeet STT."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"in{source_suffix}"
        dst = Path(tmp) / "out.wav"
        src.write_bytes(source)
        cmd = [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-fflags",
            "+genpts",
            "-i",
            str(src),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(dst),
        ]
        try:
            _run_ffmpeg(cmd, timeout=120)
        except Exception:
            cmd_retry = [
                "ffmpeg",
                "-y",
                "-nostdin",
                "-err_detect",
                "ignore_err",
                "-i",
                str(src),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(dst),
            ]
            _run_ffmpeg(cmd_retry, timeout=120)
        if not dst.is_file() or dst.stat().st_size < 44:
            raise RuntimeError("ffmpeg produced no wav for STT")
        return dst.read_bytes()


def suffix_for_mime(mime: str | None) -> str:
    m = (mime or "").lower()
    if "webm" in m:
        return ".webm"
    if "mpeg" in m or "mp3" in m:
        return ".mp3"
    if "mp4" in m or "m4a" in m:
        return ".mp4"
    if "jpeg" in m or "jpg" in m:
        return ".jpg"
    if "png" in m:
        return ".png"
    return ".bin"
