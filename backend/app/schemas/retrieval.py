from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class RetrievalScopePayload(BaseModel):
    """Client-supplied retrieval scope for AI / search endpoints."""

    level: Literal["global", "project", "topic"] = "project"
    project_ids: list[UUID] = Field(default_factory=list)
    topic_ids: list[UUID] = Field(default_factory=list)
    folder_ids: list[UUID] = Field(default_factory=list)
    include_linked: bool = False
    include_constituent_topics: bool = False
    session_scope_id: UUID | None = None
