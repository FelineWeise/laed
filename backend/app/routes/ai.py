from __future__ import annotations

import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.config import settings
from app.models import User, ProjectMember, get_db
from app.models.ai import AIConversation, AIMessage
from app.schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
)
from app.services.llm import llm_stream
from app.services.rag import build_source_chunks, get_rag

router = APIRouter(prefix="/api/projects", tags=["ai"])


def _format_excerpts(hits: list[dict[str, object]]) -> str:
    lines: list[str] = []
    for hit in hits:
        meta = hit.get("metadata")
        meta_dict = meta if isinstance(meta, dict) else {}
        filename = meta_dict.get("filename", "document")
        page = meta_dict.get("page")
        content = hit.get("content")
        text = content if isinstance(content, str) else ""
        prefix = f"[{filename}"
        if page is not None:
            prefix += f" p.{page}"
        prefix += "]"
        lines.append(f"{prefix} {text[:600]}")
    return "\n\n".join(lines)


@router.post(
    "/{project_id}/ai/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    project_id: UUID,
    body: ConversationCreate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    conv = AIConversation(
        project_id=project_id,
        user_id=current_user.id,
        is_private=body.is_private,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


@router.get("/{project_id}/ai/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AIConversation).where(AIConversation.project_id == project_id)
    )
    convs = result.scalars().all()
    visible = [
        c
        for c in convs
        if not c.is_private or c.user_id == current_user.id
    ]
    return visible


@router.get(
    "/{project_id}/ai/conversations/{conv_id}/messages",
    response_model=list[MessageResponse],
)
async def list_messages(
    project_id: UUID,
    conv_id: UUID,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(AIConversation, conv_id)
    if not conv or conv.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conv.is_private and conv.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Private conversation")

    result = await db.execute(
        select(AIMessage)
        .where(AIMessage.conversation_id == conv_id)
        .order_by(AIMessage.created_at)
    )
    return result.scalars().all()


@router.post("/{project_id}/ai/conversations/{conv_id}/messages")
async def post_message_stream(
    project_id: UUID,
    conv_id: UUID,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(AIConversation, conv_id)
    if not conv or conv.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conv.is_private and conv.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Private conversation")

    user_msg = AIMessage(
        conversation_id=conv_id,
        role="user",
        content=body.content,
    )
    db.add(user_msg)
    await db.commit()

    retriever = get_rag(project_id)
    hits: list[dict[str, object]] = []
    try:
        hits = await retriever.query(
            body.content,
            top_k=5,
            topic_node_id=body.topic_node_id,
        )
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG is not configured",
        )

    excerpts = _format_excerpts(hits)
    system = (
        "Answer using ONLY the excerpts below. If insufficient, say so clearly.\n\n"
        f"Excerpts:\n{excerpts if excerpts else '(none)'}"
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": body.content},
    ]

    async def event_stream() -> AsyncIterator[str]:
        full_parts: list[str] = []
        try:
            async for token in llm_stream(messages, model=settings.llm_model):
                full_parts.append(token)
                payload = json.dumps({"content": token})
                yield f"event: token\ndata: {payload}\n\n"
        except Exception as exc:
            err = json.dumps({"error": str(exc)})
            yield f"event: error\ndata: {err}\n\n"
            return

        assistant_text = "".join(full_parts)
        source_chunks = build_source_chunks(hits)
        assistant = AIMessage(
            conversation_id=conv_id,
            role="assistant",
            content=assistant_text,
            source_chunks=source_chunks,
        )
        db.add(assistant)
        await db.commit()
        await db.refresh(assistant)

        done_payload = json.dumps(
            {
                "message_id": str(assistant.id),
                "source_chunks": source_chunks,
            }
        )
        yield f"event: done\ndata: {done_payload}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
