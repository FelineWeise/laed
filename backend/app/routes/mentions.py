from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.models import User, get_db
from app.schemas.mentions import InboxMentionResponse
from app.services.mention_service import (
    list_inbox_mentions,
    mark_all_mentions_read,
    mark_mention_read,
)

router = APIRouter(prefix="/api/users/me", tags=["mentions"])


@router.get("/mentions", response_model=list[InboxMentionResponse])
async def get_my_mentions(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_inbox_mentions(
        db,
        user_id=current_user.id,
        unread_only=unread_only,
        limit=limit,
    )


@router.post("/mentions/{mention_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def read_mention(
    mention_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await mark_mention_read(db, mention_id=mention_id, user_id=current_user.id)
    if not ok:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


class MarkAllReadResponse(BaseModel):
    marked: int


@router.post("/mentions/read-all", response_model=MarkAllReadResponse)
async def read_all_mentions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await mark_all_mentions_read(db, user_id=current_user.id)
    return MarkAllReadResponse(marked=count)
