from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.models import User, get_db
from app.schemas.users import UserSearchResult

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/search", response_model=list[UserSearchResult])
async def search_users(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(10, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pattern = f"%{q.strip()}%"
    result = await db.execute(
        select(User)
        .where(User.id != current_user.id)
        .where(
            or_(
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
            )
        )
        .limit(limit)
    )
    users = result.scalars().all()
    return [
        UserSearchResult(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
        )
        for u in users
    ]
