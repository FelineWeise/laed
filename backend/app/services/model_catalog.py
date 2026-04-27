from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import settings


@dataclass
class _CatalogCache:
    fetched_at: datetime
    upstream_models: list[dict[str, Any]]


_cache: _CatalogCache | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _known_local_models() -> list[dict[str, Any]]:
    return [
        {"id": "laed-fast", "provider": "ollama", "supports_tools": True},
        {"id": "laed-chat", "provider": "ollama", "supports_tools": True},
        {"id": "laed-reason", "provider": "ollama", "supports_tools": True},
        {"id": "laed-fallback", "provider": "upstream-gateway", "supports_tools": True},
        {"id": "laed-embed", "provider": "ollama", "supports_tools": False},
    ]


def _normalize_upstream_model(model: dict[str, Any]) -> dict[str, Any]:
    model_id = str(model.get("id", "")).strip()
    provider = "unknown"
    if "/" in model_id:
        provider = model_id.split("/", 1)[0]
    elif "claude" in model_id:
        provider = "anthropic"
    return {
        "id": model_id,
        "provider": provider,
        "supports_tools": True,
        "raw": model,
    }


async def _fetch_upstream_models() -> list[dict[str, Any]]:
    if not settings.thirdparty_litellm_key:
        return []

    base_url = settings.thirdparty_litellm_url.rstrip("/")
    headers = {"Authorization": f"Bearer {settings.thirdparty_litellm_key}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(f"{base_url}/v1/models", headers=headers)
        resp.raise_for_status()
        payload = resp.json()
        data = payload.get("data", [])
        return [_normalize_upstream_model(m) for m in data if isinstance(m, dict)]


async def get_model_catalog() -> dict[str, Any]:
    global _cache
    local = _known_local_models()
    ttl = timedelta(seconds=max(settings.model_catalog_ttl_seconds, 30))
    now = _now()

    if _cache and now - _cache.fetched_at < ttl:
        return {
            "local": local,
            "upstream": _cache.upstream_models,
            "fetched_at": _cache.fetched_at.isoformat(),
            "cache_age_seconds": int((now - _cache.fetched_at).total_seconds()),
            "source_status": "ok",
        }

    try:
        upstream = await _fetch_upstream_models()
        _cache = _CatalogCache(fetched_at=now, upstream_models=upstream)
        return {
            "local": local,
            "upstream": upstream,
            "fetched_at": now.isoformat(),
            "cache_age_seconds": 0,
            "source_status": "ok",
        }
    except Exception as exc:  # degrade gracefully
        if _cache:
            return {
                "local": local,
                "upstream": _cache.upstream_models,
                "fetched_at": _cache.fetched_at.isoformat(),
                "cache_age_seconds": int((now - _cache.fetched_at).total_seconds()),
                "source_status": "degraded",
                "warning": f"upstream fetch failed: {exc}",
            }
        return {
            "local": local,
            "upstream": [],
            "fetched_at": now.isoformat(),
            "cache_age_seconds": 0,
            "source_status": "degraded",
            "warning": f"upstream fetch failed: {exc}",
        }
