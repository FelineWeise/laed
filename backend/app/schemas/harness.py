from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class HarnessDocumentCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=128)
    filename: str = Field(min_length=1, max_length=512)
    content: str = ""


class HarnessDocumentUpdate(BaseModel):
    filename: str | None = Field(default=None, min_length=1, max_length=512)
    content: str | None = None


class HarnessDocumentResponse(BaseModel):
    id: UUID
    user_id: UUID
    project_id: UUID | None
    slug: str
    filename: str
    content: str
    updated_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
