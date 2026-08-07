"""Embedding routing errors surfaced to the client."""

from __future__ import annotations


class OssEmbeddingUnavailable(Exception):
    """On-device (OSS/GPU) embeddings cannot run; client may offer thirdparty fallback."""

    def __init__(self, message: str = "On-device embedding is unavailable.") -> None:
        self.message = message
        super().__init__(message)


def is_oss_embedding_failure(exc: BaseException) -> bool:
    text = str(exc).lower()
    markers = (
        "daily gpu uptime budget exceeded",
        "budgetexceeded",
        "gpu_unavailable",
        "gpu uptime budget",
    )
    if any(m in text for m in markers):
        return True
    if "embeddings failed" in text and "ollama/" in text:
        return True
    return False
