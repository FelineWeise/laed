from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ExplicitContextType = Literal[
    "file",
    "folder",
    "thread",
    "ai_conversation",
    "project",
    "topic",
    "harness_excerpt",
]


class ExplicitContextItem(BaseModel):
    type: ExplicitContextType
    ref_id: str
    label: str = ""


class ExplicitContextPayload(BaseModel):
    items: list[ExplicitContextItem] = Field(default_factory=list)
