from typing import AsyncIterator
import json

import httpx

from app.config import settings


async def llm_chat(messages: list[dict], *, model: str | None = None) -> str:
    """Call LLM via LiteLLM gateway (OpenAI-compatible)."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.llm_gateway_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_gateway_key}"},
            json={
                "model": model or settings.llm_model,
                "messages": messages,
                "stream": False,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def llm_stream(
    messages: list[dict], *, model: str | None = None
) -> AsyncIterator[str]:
    """Stream LLM response via LiteLLM gateway (OpenAI-compatible SSE)."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{settings.llm_gateway_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_gateway_key}"},
            json={
                "model": model or settings.llm_model,
                "messages": messages,
                "stream": True,
            },
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


async def embed_text(text: str, *, model: str | None = None) -> list[float]:
    """Generate embeddings via LiteLLM gateway (OpenAI-compatible)."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.llm_gateway_url}/embeddings",
            headers={"Authorization": f"Bearer {settings.llm_gateway_key}"},
            json={
                "model": model or settings.embedding_model,
                "input": text,
            },
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
