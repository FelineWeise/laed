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
) -> list[dict[str, str]]:
    """Optional tool rounds, then return messages ready for final stream."""
    if not settings.search_enabled:
        return messages

    tools = openai_tools_payload()
    if not tools:
        return messages

    working = list(messages)
    try:
        return await _run_tool_rounds(working, model=model, tools=tools)
    except Exception:
        logger.exception("agent_loop failed; continuing without tool context")
        return messages


async def _run_tool_rounds(
    working: list[dict[str, str]],
    *,
    model: str,
    tools: list[dict[str, Any]],
) -> list[dict[str, str]]:
    for _ in range(MAX_TOOL_ROUNDS):
        response = await gateway.chat_with_tools(working, model=model, tools=tools)
        if not response.get("tool_calls"):
            if response.get("content"):
                working.append({"role": "assistant", "content": str(response["content"])})
            return working

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
    return working
