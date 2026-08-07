from typing import AsyncIterator
import json

import httpx

from app.config import settings


_CHAT_PROVIDERS = ("scaleway/", "thirdparty/", "ollama/")
_KNOWN_EMBEDDING_IDS = frozenset(
    {
        "ollama/nomic-embed-text",
        "ollama/qwen3-embedding:8b",
        "scaleway/qwen3-embedding-8b",
        "scaleway/bge-embed",
        "thirdparty/text-embedding-3-large",
        "thirdparty/text-embedding-3-small",
    }
)


def is_embedding_model(model_id: str) -> bool:
    """True for embedding models across scaleway/thirdparty/ollama providers."""
    if model_id.startswith("stt/"):
        return False
    if "embed" in model_id.lower():
        return True
    return model_id in _KNOWN_EMBEDDING_IDS


def is_chat_model(model_id: str) -> bool:
    """Chat models from gateway providers; exclude stt/* and embedding models."""
    if model_id.startswith("stt/"):
        return False
    if is_embedding_model(model_id):
        return False
    return model_id.startswith(_CHAT_PROVIDERS)


def is_thirdparty_embedding_model(model_id: str) -> bool:
    return model_id.startswith("thirdparty/") and is_embedding_model(model_id)


def is_scaleway_embedding_model(model_id: str) -> bool:
    return model_id.startswith("scaleway/") and is_embedding_model(model_id)


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
        self,
        messages: list[dict],
        *,
        model: str,
        stream: bool = False,
        max_tokens: int | None = None,
    ) -> str:
        data = await self.chat_with_tools(
            messages, model=model, tools=None, max_tokens=max_tokens
        )
        content = data.get("content")
        return content if isinstance(content, str) else ""

    async def chat_with_tools(
        self,
        messages: list[dict],
        *,
        model: str,
        tools: list[dict] | None,
        max_tokens: int | None = None,
    ) -> dict[str, object]:
        payload: dict[str, object] = {"model": model, "messages": messages, "stream": False}
        if max_tokens is not None and max_tokens > 0:
            payload["max_tokens"] = max_tokens
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            message = resp.json()["choices"][0]["message"]
            out: dict[str, object] = {
                "content": message.get("content"),
                "tool_calls": message.get("tool_calls"),
            }
            return out

    async def stream_chat(
        self,
        messages: list[dict],
        *,
        model: str,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        body: dict[str, object] = {"model": model, "messages": messages, "stream": True}
        if max_tokens is not None and max_tokens > 0:
            body["max_tokens"] = max_tokens
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json=body,
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
            if resp.status_code >= 400:
                detail = resp.text[:500]
                raise RuntimeError(
                    f"Embeddings failed ({resp.status_code}) for model {model}: {detail}"
                )
            return resp.json()["data"][0]["embedding"]

    async def list_models(self) -> list[dict[str, object]]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{self._base_url}/models",
                headers=self._headers(),
            )
            resp.raise_for_status()
            payload = resp.json()
            data = payload.get("data")
            if not isinstance(data, list):
                return []
            return [row for row in data if isinstance(row, dict)]

    async def embed_many(self, texts: list[str], *, model: str) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self._base_url}/embeddings",
                headers=self._headers(),
                json={"model": model, "input": texts},
            )
            resp.raise_for_status()
            rows = resp.json()["data"]
            rows.sort(key=lambda r: int(r["index"]))
            return [r["embedding"] for r in rows]


# ── Pre-configured clients ───────────────────────────────

gateway = LLMClient(
    base_url=settings.llm_gateway_url,
    api_key=settings.llm_gateway_key,
)


# ── Convenience functions (use gateway by default) ────────

async def llm_chat(
    messages: list[dict],
    *,
    model: str | None = None,
    max_tokens: int | None = None,
) -> str:
    cap = max_tokens if max_tokens is not None else settings.ai_max_tokens
    return await gateway.chat(
        messages, model=model or settings.llm_model, max_tokens=cap
    )


async def llm_stream(
    messages: list[dict],
    *,
    model: str | None = None,
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    cap = max_tokens if max_tokens is not None else settings.ai_max_tokens
    async for token in gateway.stream_chat(
        messages,
        model=model or settings.llm_model,
        max_tokens=cap,
    ):
        yield token


async def embed_text(text: str, *, model: str | None = None) -> list[float]:
    return await gateway.embed(text, model=model or settings.embedding_model)
