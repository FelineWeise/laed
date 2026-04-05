from typing import AsyncIterator, Protocol

import httpx

from app.config import settings


class ChatMessage:
    __slots__ = ("role", "content")

    def __init__(self, role: str, content: str) -> None:
        self.role = role
        self.content = content

    def to_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


class LLMProvider(Protocol):
    async def chat(
        self, messages: list[ChatMessage], *, model: str | None = None
    ) -> str: ...

    async def stream_chat(
        self, messages: list[ChatMessage], *, model: str | None = None
    ) -> AsyncIterator[str]: ...

    async def embed(
        self, text: str, *, model: str | None = None
    ) -> list[float]: ...


class OllamaProvider:
    """Ollama-backed LLM provider. Speaks the Ollama HTTP API."""

    def __init__(self, base_url: str, default_model: str, embedding_model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._default_model = default_model
        self._embedding_model = embedding_model
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=120.0)

    async def chat(
        self, messages: list[ChatMessage], *, model: str | None = None
    ) -> str:
        resp = await self._client.post(
            "/api/chat",
            json={
                "model": model or self._default_model,
                "messages": [m.to_dict() for m in messages],
                "stream": False,
            },
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]

    async def stream_chat(
        self, messages: list[ChatMessage], *, model: str | None = None
    ) -> AsyncIterator[str]:
        async with self._client.stream(
            "POST",
            "/api/chat",
            json={
                "model": model or self._default_model,
                "messages": [m.to_dict() for m in messages],
                "stream": True,
            },
        ) as resp:
            resp.raise_for_status()
            import json as _json

            async for line in resp.aiter_lines():
                if not line:
                    continue
                chunk = _json.loads(line)
                if token := chunk.get("message", {}).get("content", ""):
                    yield token

    async def embed(
        self, text: str, *, model: str | None = None
    ) -> list[float]:
        resp = await self._client.post(
            "/api/embed",
            json={
                "model": model or self._embedding_model,
                "input": text,
            },
        )
        resp.raise_for_status()
        return resp.json()["embeddings"][0]

    async def close(self) -> None:
        await self._client.aclose()


_PROVIDERS: dict[str, type] = {
    "ollama": OllamaProvider,
}

_instance: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    """Factory: returns a singleton LLM provider based on config."""
    global _instance
    if _instance is not None:
        return _instance

    provider_name = settings.llm_provider
    if provider_name == "ollama":
        _instance = OllamaProvider(
            base_url=settings.ollama_url,
            default_model=settings.llm_model,
            embedding_model=settings.embedding_model,
        )
    else:
        raise ValueError(
            f"Unknown LLM provider '{provider_name}'. "
            f"Available: {', '.join(_PROVIDERS)}"
        )
    return _instance
