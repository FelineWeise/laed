from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any


ToolHandler = Callable[[dict[str, Any]], Awaitable[str]]


@dataclass(frozen=True)
class ToolDef:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolHandler

    def openai_tool(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


_REGISTRY: list[ToolDef] = []


def register_tool(tool: ToolDef) -> None:
    _REGISTRY.append(tool)


def get_tools() -> list[ToolDef]:
    return list(_REGISTRY)


def get_tool(name: str) -> ToolDef | None:
    for tool in _REGISTRY:
        if tool.name == name:
            return tool
    return None


def openai_tools_payload() -> list[dict[str, Any]]:
    return [t.openai_tool() for t in _REGISTRY]
