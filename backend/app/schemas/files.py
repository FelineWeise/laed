from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class FileResponse(BaseModel):
    id: UUID
    project_id: UUID
    folder_id: UUID
    filename: str
    file_type: str | None
    file_size_bytes: int | None
    minio_key: str
    ingestion_status: str
    is_private: bool = False
    shared_with_user_ids: list[UUID] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class FileUpdate(BaseModel):
    is_private: bool | None = None
    """When shared (is_private=false): empty/omitted = everyone; non-empty = restricted."""
    share_with_user_ids: list[UUID] | None = None


class FileDetailResponse(FileResponse):
    download_url: str
