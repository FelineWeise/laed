from typing import AsyncIterator
import json

import httpx

from app.config import settings


class LLMClient:
    """OpenAI-compatible LLM client. Works with LiteLLM, Ollama (/v1), or any
    provider that speaks the OpenAI chat/completions and embeddings API."""

    def __init__(self, base_url: str, api_key: str = "", timeout: float = 120.0):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        if self._api_key:
            return {"Authorization": f"Bearer {self._api_key}"}
        return {}

    async def chat(
        self, messages: list[dict], *, model: str, stream: bool = False
    ) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json={"model": model, "messages": messages, "stream": False},
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    async def stream_chat(
        self, messages: list[dict], *, model: str
    ) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json={"model": model, "messages": messages, "stream": True},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[len("data: "):]
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    if token := chunk["choices"][0]["delta"].get("content", ""):
                        yield token

    async def embed(self, text: str, *, model: str) -> list[float]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self._base_url}/embeddings",
                headers=self._headers(),
                json={"model": model, "input": text},
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]


# ── Pre-configured clients ───────────────────────────────

gateway = LLMClient(
    base_url=settings.llm_gateway_url,
    api_key=settings.llm_gateway_key,
)

ollama = LLMClient(
    base_url=f"{settings.ollama_url}/v1",
)


# ── Convenience functions (use gateway by default) ───────

async def llm_chat(messages: list[dict], *, model: str | None = None) -> str:
    return await gateway.chat(messages, model=model or settings.llm_model)


async def llm_stream(
    messages: list[dict], *, model: str | None = None
) -> AsyncIterator[str]:
    async for token in gateway.stream_chat(messages, model=model or settings.llm_model):
        yield token


async def embed_text(text: str, *, model: str | None = None) -> list[float]:
    return await gateway.embed(text, model=model or settings.embedding_model)
