from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings
from app.services.llm import gateway
from app.services.tools.registry import get_tool, openai_tools_payload

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 2


async def run_agent_loop(
    messages: list[dict[str, str]],
    *,
    model: str,
) -> tuple[list[dict[str, str]], str | None]:
    """Optional tool rounds before the final user-visible reply.

    Used by every streaming AI entry point:
    - project thread chat (`thread_ai.stream_thread_ai_reply` / `chat.ai-stream`)
    - project LAED panel (`routes/ai.py`)
    - workspace LAED (`routes/workspace_ai.py`)

    Returns ``(messages_for_stream, direct_reply)``. When ``direct_reply`` is set,
    the model already produced the answer (with or without tools) and callers should
    persist that text instead of running a second streaming completion — otherwise
    the stream only generates a short follow-up and the real answer is lost.
    """
    if not settings.search_enabled:
        return messages, None

    tools = openai_tools_payload()
    if not tools:
        return messages, None

    working = list(messages)
    try:
        return await _run_tool_rounds(working, model=model, tools=tools)
    except Exception:
        logger.exception("agent_loop failed; continuing without tool context")
        return messages, None


async def _run_tool_rounds(
    working: list[dict[str, str]],
    *,
    model: str,
    tools: list[dict[str, Any]],
) -> tuple[list[dict[str, str]], str | None]:
    for _ in range(MAX_TOOL_ROUNDS):
        response = await gateway.chat_with_tools(working, model=model, tools=tools)
        if not response.get("tool_calls"):
            content = response.get("content")
            if isinstance(content, str) and content.strip():
                return working, content.strip()
            return working, None

        working.append(
            {
                "role": "assistant",
                "content": response.get("content") or "",
                "tool_calls": response["tool_calls"],
            }
        )
        for call in response["tool_calls"]:
            fn = call.get("function") or {}
            name = fn.get("name", "")
            raw_args = fn.get("arguments", "{}")
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except json.JSONDecodeError:
                args = {}
            tool = get_tool(name)
            result = await tool.handler(args) if tool else f"Unknown tool: {name}"
            working.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id", name),
                    "content": result,
                }
            )
    return _strip_tool_only_tail(working), None


def _strip_tool_only_tail(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop trailing assistant rows that only carry tool_calls (not valid for stream)."""
    trimmed = list(messages)
    while trimmed:
        last = trimmed[-1]
        if last.get("role") != "assistant":
            break
        content = last.get("content")
        has_text = isinstance(content, str) and content.strip()
        if has_text or not last.get("tool_calls"):
            break
        trimmed.pop()
    return trimmed
