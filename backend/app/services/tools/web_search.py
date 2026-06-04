from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings
from app.services.tools.registry import ToolDef, register_tool

WEB_SEARCH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "Search query"},
    },
    "required": ["query"],
}


async def _search_tavily(query: str) -> str:
    if not settings.tavily_api_key:
        return "Web search is not configured (missing TAVILY_API_KEY)."
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": settings.tavily_api_key,
                "query": query,
                "max_results": 5,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    results = data.get("results", [])
    lines: list[str] = []
    for row in results:
        if not isinstance(row, dict):
            continue
        title = row.get("title", "")
        url = row.get("url", "")
        content = row.get("content", "")
        lines.append(f"- {title} ({url}): {content}")
    return "\n".join(lines) if lines else "No results found."


async def _search_serper(query: str) -> str:
    if not settings.serper_api_key:
        return "Web search is not configured (missing SERPER_API_KEY)."
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://google.serper.dev/search",
            headers={"X-API-KEY": settings.serper_api_key},
            json={"q": query, "num": 5},
        )
        resp.raise_for_status()
        data = resp.json()
    organic = data.get("organic", [])
    lines: list[str] = []
    for row in organic:
        if not isinstance(row, dict):
            continue
        title = row.get("title", "")
        link = row.get("link", "")
        snippet = row.get("snippet", "")
        lines.append(f"- {title} ({link}): {snippet}")
    return "\n".join(lines) if lines else "No results found."


async def run_web_search(args: dict[str, Any]) -> str:
    query = str(args.get("query", "")).strip()
    if not query:
        return "Empty search query."
    provider = settings.search_provider.lower()
    if provider == "serper":
        return await _search_serper(query)
    return await _search_tavily(query)


def init_web_search_tool() -> None:
    register_tool(
        ToolDef(
            name="web_search",
            description=(
                "Search the public web for current information, documentation, "
                "or facts not covered by project documents."
            ),
            parameters=WEB_SEARCH_SCHEMA,
            handler=run_web_search,
        )
    )
