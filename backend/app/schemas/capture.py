from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CaptureSessionCreate(BaseModel):
    kind: str
    title: str = ""
    project_id: UUID | None = None
    topic_node_id: UUID | None = None
    is_private: bool = True


class CaptureSessionUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    project_id: UUID | None = None
    topic_node_id: UUID | None = None
    is_private: bool | None = None
    transcript: str | None = None


class CaptureSessionResponse(BaseModel):
    id: UUID
    user_id: UUID
    kind: str
    title: str
    status: str
    project_id: UUID | None
    topic_node_id: UUID | None
    transcript: str
    is_private: bool
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    ended_at: datetime | None = None

    model_config = {"from_attributes": True}


class CaptureAssetResponse(BaseModel):
    id: UUID
    session_id: UUID
    file_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
