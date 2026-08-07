from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.auth.access import has_project_access
from app.models import User, ProjectMember, get_db
from app.models.ai import AIConversation, AIMessage
from app.models.thread_session import ThreadSession
from app.services.ai_conversation_links import delete_ai_conversation_tree
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

router = APIRouter(prefix="/api/projects", tags=["ai"])


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
    linked_session_id: UUID | None = body.linked_thread_session_id
    if linked_session_id is not None:
        linked = await db.get(ThreadSession, linked_session_id)
        if not linked or linked.project_id != project_id:
            linked_session_id = None

    conv = AIConversation(
        project_id=project_id,
        user_id=current_user.id,
        is_private=body.is_private,
        topic_node_id=body.topic_node_id,
        linked_thread_session_id=linked_session_id,
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
        select(AIConversation)
        .where(AIConversation.project_id == project_id)
        .order_by(AIConversation.created_at.desc())
    )
    convs = result.scalars().all()
    visible = [
        c
        for c in convs
        if not c.is_private or c.user_id == current_user.id
    ]
    return visible


@router.patch(
    "/{project_id}/ai/conversations/{conv_id}",
    response_model=ConversationResponse,
)
async def update_conversation(
    project_id: UUID,
    conv_id: UUID,
    body: ConversationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(AIConversation, conv_id)
    if not conv or conv.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conv.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your conversation")
    patch = body.model_dump(exclude_unset=True)
    if "title" in patch and patch["title"] is not None:
        conv.title = patch["title"].strip() or conv.title
    if "topic_node_id" in patch:
        conv.topic_node_id = patch["topic_node_id"]
    if "is_private" in patch and patch["is_private"] is not None:
        conv.is_private = patch["is_private"]
    if "project_id" in patch:
        pid = patch["project_id"]
        if pid is not None and pid != project_id and not await has_project_access(
            db, pid, current_user.id
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
        if pid is not None:
            conv.project_id = pid
    await db.commit()
    await db.refresh(conv)
    return conv


@router.delete(
    "/{project_id}/ai/conversations/{conv_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation(
    project_id: UUID,
    conv_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(AIConversation, conv_id)
    if not conv or conv.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conv.is_private and conv.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Private conversation")

    await delete_ai_conversation_tree(db, conv_id=conv.id, delete_linked_thread=True)
    await db.commit()


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
    from app.services.ai_conversations import ensure_conversation_title

    await ensure_conversation_title(conv, body.content)
    await db.commit()

    if body.retrieval_scope is None:
        from app.schemas.retrieval import RetrievalScopePayload

        body = body.model_copy(
            update={
                "retrieval_scope": RetrievalScopePayload(
                    session_scope_id=conv_id,
                ),
            }
        )
    elif body.retrieval_scope.session_scope_id is None:
        body = body.model_copy(
            update={
                "retrieval_scope": body.retrieval_scope.model_copy(
                    update={"session_scope_id": conv_id}
                ),
            }
        )

    try:
        system, llm_messages, hits = await build_chat_context(
            db,
            user_id=current_user.id,
            project_id=project_id,
            body=body,
            mode="project",
            conversation_id=conv_id,
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
            conv_id=conv_id,
            messages=messages,
            model=model,
            direct_reply=direct_reply,
            source_hits=hits,
            index_project_id=project_id,
            index_user_text=body.content,
            index_topic_node_id=body.topic_node_id,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
