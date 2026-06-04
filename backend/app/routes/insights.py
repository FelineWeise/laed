from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_project_role
from app.models import ProjectMember, get_db
from app.models.ai import AIConversation, AIMessage
from app.models.file import File

router = APIRouter(prefix="/api/projects", tags=["insights"])


@router.get("/{project_id}/insights")
async def project_insights(
    project_id: UUID,
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    conv_result = await db.execute(
        select(AIConversation.id).where(AIConversation.project_id == project_id)
    )
    conv_ids = [row[0] for row in conv_result.all()]

    ai_bullets: list[dict[str, str]] = []
    if conv_ids:
        msg_result = await db.execute(
            select(AIMessage)
            .where(AIMessage.conversation_id.in_(conv_ids))
            .where(AIMessage.role == "assistant")
            .order_by(AIMessage.created_at.desc())
            .limit(10)
        )
        for msg in msg_result.scalars().all():
            text = msg.content.strip().replace("\n", " ")
            if len(text) > 120:
                text = text[:120] + "…"
            ai_bullets.append({"id": str(msg.id), "text": text})

    files_result = await db.execute(
        select(File)
        .where(File.project_id == project_id)
        .order_by(File.created_at.desc())
        .limit(20)
    )
    documents = [
        {
            "id": str(f.id),
            "filename": f.filename,
            "ingestion_status": f.ingestion_status,
            "created_at": f.created_at.isoformat(),
        }
        for f in files_result.scalars().all()
    ]

    return {
        "ai_highlights": ai_bullets,
        "recent_documents": documents,
    }
