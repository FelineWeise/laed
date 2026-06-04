from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.models import User, get_db
from app.models.grid_section import UserGridSection
from app.schemas.grid_section import (
    GridSectionCreate,
    GridSectionResponse,
    GridSectionUpdate,
)

router = APIRouter(prefix="/api/users/me", tags=["grid-sections"])


@router.get("/grid-sections", response_model=list[GridSectionResponse])
async def list_grid_sections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserGridSection)
        .where(UserGridSection.user_id == current_user.id)
        .order_by(UserGridSection.sort_order, UserGridSection.created_at)
    )
    return list(result.scalars().all())


@router.post(
    "/grid-sections",
    response_model=GridSectionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_grid_section(
    body: GridSectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bounds = body.bounds.model_dump() if body.bounds is not None else None
    row = UserGridSection(
        user_id=current_user.id,
        name=body.name.strip(),
        sort_order=body.sort_order,
        tag_filters=body.tag_filters,
        bounds=bounds,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/grid-sections/{section_id}", response_model=GridSectionResponse)
async def update_grid_section(
    section_id: UUID,
    body: GridSectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(UserGridSection, section_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")

    updates = body.model_dump(exclude_unset=True)
    if "bounds" in updates and updates["bounds"] is not None:
        updates["bounds"] = body.bounds.model_dump() if body.bounds is not None else None
    for field, value in updates.items():
        if field == "name" and isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        setattr(row, field, value)

    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/grid-sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grid_section(
    section_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(UserGridSection, section_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    await db.delete(row)
    await db.commit()
