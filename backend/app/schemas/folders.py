from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str
    parent_id: UUID | None = None
    topic_node_id: UUID | None = None


class FolderUpdate(BaseModel):
    name: str | None = None
    parent_id: UUID | None = None
    topic_node_id: UUID | None = None


class FolderResponse(BaseModel):
    id: UUID
    project_id: UUID
    topic_node_id: UUID | None
    parent_id: UUID | None
    name: str
    path: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FolderInclusionUpdate(BaseModel):
    included: bool


class FolderInclusionResponse(BaseModel):
    id: UUID
    folder_id: UUID
    project_id: UUID
    included: bool

    model_config = {"from_attributes": True}
