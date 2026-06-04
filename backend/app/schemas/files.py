from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class FileResponse(BaseModel):
    id: UUID
    project_id: UUID
    filename: str
    file_type: str | None
    file_size_bytes: int | None
    minio_key: str
    ingestion_status: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class FileDetailResponse(FileResponse):
    download_url: str
