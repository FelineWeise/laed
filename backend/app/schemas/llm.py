from __future__ import annotations

from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str


class ModelsListResponse(BaseModel):
    data: list[ModelInfo]


class DefaultModelResponse(BaseModel):
    model: str
