from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.models import User
from app.services.model_catalog import get_model_catalog

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/catalog")
async def model_catalog(_: User = Depends(get_current_user)):
    return await get_model_catalog()
