from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.models import User, get_db
from app.models.ai import AIConversation, AIMessage
from app.schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
)
from app.services.agent_loop import run_agent_loop
from app.services.ai_chat import resolve_model, stream_assistant_reply
from app.services.chat_context import build_chat_context

router = APIRouter(prefix="/api/ai", tags=["workspace-ai"])


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_workspace_conversation(
    body: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = AIConversation(
        project_id=None,
        user_id=current_user.id,
        is_private=body.is_private,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_workspace_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AIConversation)
        .where(
            AIConversation.project_id.is_(None),
            AIConversation.user_id == current_user.id,
        )
        .order_by(AIConversation.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/conversations/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace_conversation(
    conv_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_workspace_conversation(db, conv_id, current_user.id)
    from sqlalchemy import delete as sql_delete

    await db.execute(sql_delete(AIMessage).where(AIMessage.conversation_id == conv.id))
    await db.delete(conv)
    await db.commit()


@router.get("/conversations/{conv_id}/messages", response_model=list[MessageResponse])
async def list_workspace_messages(
    conv_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_workspace_conversation(db, conv_id, current_user.id)
    result = await db.execute(
        select(AIMessage)
        .where(AIMessage.conversation_id == conv.id)
        .order_by(AIMessage.created_at)
    )
    return result.scalars().all()


@router.post("/conversations/{conv_id}/messages")
async def post_workspace_message_stream(
    conv_id: UUID,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_workspace_conversation(db, conv_id, current_user.id)

    user_msg = AIMessage(
        conversation_id=conv.id,
        role="user",
        content=body.content,
    )
    db.add(user_msg)
    from app.services.ai_conversations import ensure_conversation_title

    await ensure_conversation_title(conv, body.content)
    await db.commit()

    system, llm_messages, _hits = await build_chat_context(
        db,
        user_id=current_user.id,
        project_id=None,
        body=body,
        mode="workspace",
        conversation_id=conv.id,
    )
    model = resolve_model(body)
    messages = [{"role": "system", "content": system}, *llm_messages]
    messages = await run_agent_loop(messages, model=model)

    return StreamingResponse(
        stream_assistant_reply(db, conv_id=conv.id, messages=messages, model=model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _get_workspace_conversation(
    db: AsyncSession, conv_id: UUID, user_id: UUID
) -> AIConversation:
    conv = await db.get(AIConversation, conv_id)
    if not conv or conv.project_id is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conv.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your conversation")
    return conv
