"""Normalize chat message lists for streaming completions."""

from __future__ import annotations

from typing import Any


def flatten_messages_for_stream(messages: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Drop tool_calls payloads; keep roles the chat API accepts for stream=True."""
    out: list[dict[str, str]] = []
    for msg in messages:
        role = msg.get("role")
        if role == "system":
            content = msg.get("content")
            if isinstance(content, str) and content.strip():
                out.append({"role": "system", "content": content})
            continue
        if role == "user":
            content = msg.get("content")
            if isinstance(content, str) and content.strip():
                out.append({"role": "user", "content": content})
            continue
        if role == "assistant":
            content = msg.get("content")
            if isinstance(content, str) and content.strip():
                out.append({"role": "assistant", "content": content})
            continue
        if role == "tool":
            raw = msg.get("content")
            text = raw if isinstance(raw, str) else str(raw or "")
            text = text.strip()
            if not text:
                continue
            if len(text) > 4000:
                text = text[:4000] + "…"
            name = "tool"
            tool_calls = msg.get("tool_calls")
            if isinstance(tool_calls, list) and tool_calls:
                fn = tool_calls[0].get("function") if isinstance(tool_calls[0], dict) else None
                if isinstance(fn, dict) and fn.get("name"):
                    name = str(fn["name"])
            out.append(
                {
                    "role": "user",
                    "content": f"Tool result ({name}): {text}",
                }
            )
    return out
