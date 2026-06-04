from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ThreadSessionCreate(BaseModel):
    title: str = "New thread"


class ThreadSessionUpdate(BaseModel):
    title: str | None = None
    ai_enabled: bool | None = None


class ThreadSessionResponse(BaseModel):
    id: UUID
    project_id: UUID
    topic_node_id: UUID | None
    title: str
    ai_enabled: bool = False
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
