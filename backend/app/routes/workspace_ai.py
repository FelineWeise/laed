from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.access import has_project_access
from app.models import User, get_db
from app.models.ai import AIConversation, AIMessage
from app.schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    ConversationUpdate,
    MessageCreate,
    MessageResponse,
)
from app.services.agent_loop import run_agent_loop
from app.services.ai_chat import resolve_model, stream_assistant_reply
from app.services.embedding_errors import OssEmbeddingUnavailable
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
        .where(AIConversation.user_id == current_user.id)
        .order_by(AIConversation.created_at.desc())
    )
    return list(result.scalars().all())


@router.patch("/conversations/{conv_id}", response_model=ConversationResponse)
async def update_workspace_conversation(
    conv_id: UUID,
    body: ConversationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_workspace_conversation(db, conv_id, current_user.id)
    patch = body.model_dump(exclude_unset=True)
    if "title" in patch and patch["title"] is not None:
        conv.title = patch["title"].strip() or conv.title
    if "topic_node_id" in patch:
        conv.topic_node_id = patch["topic_node_id"]
    if "is_private" in patch and patch["is_private"] is not None:
        conv.is_private = patch["is_private"]
    if "project_id" in patch:
        pid = patch["project_id"]
        if pid is not None and not await has_project_access(db, pid, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
        conv.project_id = pid
    await db.commit()
    await db.refresh(conv)
    return conv


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

    effective_project_id: UUID | None = None
    if conv.project_id is not None and not conv.is_private:
        effective_project_id = conv.project_id

    chat_mode = "workspace"
    if effective_project_id is not None:
        chat_mode = "project"

    msg_body = body
    if effective_project_id is not None and conv.topic_node_id is not None and body.topic_node_id is None:
        msg_body = body.model_copy(update={"topic_node_id": conv.topic_node_id})

    try:
        system, llm_messages, _hits = await build_chat_context(
            db,
            user_id=current_user.id,
            project_id=effective_project_id,
            body=msg_body,
            mode=chat_mode,
            conversation_id=conv.id,
        )
    except OssEmbeddingUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "oss_embedding_unavailable", "message": str(exc)},
        ) from exc
    model = resolve_model(body)
    messages = [{"role": "system", "content": system}, *llm_messages]
    messages, direct_reply = await run_agent_loop(messages, model=model)

    return StreamingResponse(
        stream_assistant_reply(
            db,
            conv_id=conv.id,
            messages=messages,
            model=model,
            direct_reply=direct_reply,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _get_workspace_conversation(
    db: AsyncSession, conv_id: UUID, user_id: UUID
) -> AIConversation:
    conv = await db.get(AIConversation, conv_id)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conv.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your conversation")
    return conv
