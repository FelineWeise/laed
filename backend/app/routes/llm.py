from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.schemas.llm import (
    DefaultModelResponse,
    EmbeddingModelsListResponse,
    ModelInfo,
    ModelsListResponse,
)
from app.services.llm import (
    gateway,
    is_chat_model,
    is_thirdparty_embedding_model,
)

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.get("/models/default", response_model=DefaultModelResponse)
async def get_default_model():
    return DefaultModelResponse(model=settings.llm_model)


@router.get("/models", response_model=ModelsListResponse)
async def list_chat_models():
    try:
        rows = await gateway.list_models()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM gateway unavailable: {exc}",
        ) from exc

    models: list[ModelInfo] = []
    for row in rows:
        raw_id = row.get("id")
        if not isinstance(raw_id, str) or not is_chat_model(raw_id):
            continue
        models.append(ModelInfo(id=raw_id))

    models.sort(key=lambda m: m.id)
    return ModelsListResponse(data=models)


@router.get("/embedding-models/thirdparty", response_model=EmbeddingModelsListResponse)
async def list_thirdparty_embedding_models():
    """External embedding providers (used when on-device GPU path is unavailable)."""
    try:
        rows = await gateway.list_models()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM gateway unavailable: {exc}",
        ) from exc

    models: list[ModelInfo] = []
    for row in rows:
        raw_id = row.get("id")
        if not isinstance(raw_id, str) or not is_thirdparty_embedding_model(raw_id):
            continue
        models.append(ModelInfo(id=raw_id, mode="embedding"))

    models.sort(key=lambda m: m.id)
    fallback_default = models[0].id if models else "thirdparty/text-embedding-3-large"
    return EmbeddingModelsListResponse(data=models, default=fallback_default)
