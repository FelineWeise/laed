from __future__ import annotations

from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    mode: str = "chat"


class ModelsListResponse(BaseModel):
    data: list[ModelInfo]


class EmbeddingModelsListResponse(BaseModel):
    data: list[ModelInfo]
    default: str


class DefaultModelResponse(BaseModel):
    model: str
