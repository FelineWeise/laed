from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.harness import HarnessDocument


async def build_system_prompt(
    db: AsyncSession,
    *,
    user_id: UUID,
    project_id: UUID | None,
) -> str:
    """Compose harness/workbench instructions for global and project scope."""
    scopes = [HarnessDocument.project_id.is_(None)]
    if project_id is not None:
        scopes.append(HarnessDocument.project_id == project_id)

    result = await db.execute(
        select(HarnessDocument)
        .where(
            HarnessDocument.user_id == user_id,
            or_(*scopes),
        )
        .order_by(
            HarnessDocument.project_id.nulls_first(),
            HarnessDocument.slug,
        )
    )
    docs = result.scalars().all()
    if not docs:
        return ""

    sections: list[str] = []
    for doc in docs:
        scope = "project" if doc.project_id is not None else "workspace"
        sections.append(f"## [{scope}] {doc.slug}\n{doc.content.strip()}")
    return "\n\n".join(sections)
