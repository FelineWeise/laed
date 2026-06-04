from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class GridSectionBounds(BaseModel):
    x: float
    y: float
    w: float
    h: float


class GridSectionCreate(BaseModel):
    name: str
    sort_order: int = 0
    tag_filters: list[str] = Field(default_factory=list)
    bounds: GridSectionBounds | None = None


class GridSectionUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None
    tag_filters: list[str] | None = None
    bounds: GridSectionBounds | None = None


class GridSectionResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    sort_order: int
    tag_filters: list[str]
    bounds: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
