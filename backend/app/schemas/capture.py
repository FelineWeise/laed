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
    capture_mode: str | None = None


class CaptureSessionUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    project_id: UUID | None = None
    topic_node_id: UUID | None = None
    is_private: bool | None = None
    transcript: str | None = None
    capture_mode: str | None = None


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
    file_id: UUID | None
    filename: str | None = None
    content_type: str | None = None
    asset_kind: str = "image"
    download_url: str | None = None
    transcoded: bool = False
    project_id: UUID | None = None
    is_private: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


class CaptureAssetUpdate(BaseModel):
    """Attach an asset to a project with Idea-1 visibility.

    is_private=true → owner only (default).
    is_private=false + share_with_user_ids empty/omitted → everyone in project.
    is_private=false + share_with_user_ids non-empty → those members (+ owner).
    """

    project_id: UUID | None = None
    is_private: bool | None = None
    share_with_user_ids: list[UUID] | None = None
