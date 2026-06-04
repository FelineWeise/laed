from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.access import has_any_topic_access_in_project, has_project_access, has_topic_access
from app.auth.dependencies import ROLE_HIERARCHY, get_current_user, require_project_role
from app.auth.jwt import decode_access_token
from app.config import settings
from app.models import User, ProjectMember, get_db
from app.models.base import async_session
from app.models.message import Message as MessageModel
from app.models.thread_session import ThreadSession
from app.schemas.context import ExplicitContextItem
from app.schemas.thread_session import (
    ThreadSessionCreate,
    ThreadSessionResponse,
    ThreadSessionUpdate,
)
from app.services.thread_sessions import resolve_thread_session_id
from app.services.chat_messages import message_payload, submit_project_chat_message
from app.services.mention_service import mentions_for_message_ids
from app.services.thread_ai import stream_thread_ai_reply
from pydantic import BaseModel, Field

router = APIRouter(tags=["chat"])


class MessageCreate(BaseModel):
    content: str
    is_anonymous: bool = False
    topic_node_id: UUID | None = None
    thread_session_id: UUID | None = None
    explicit_context: list[ExplicitContextItem] = Field(default_factory=list)
    model: str | None = None
    include_ai: bool = False
    reply_to_id: UUID | None = None
    mentioned_user_ids: list[UUID] = Field(default_factory=list)

CHANNEL_PREFIX = "chat:"


def _redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


@asynccontextmanager
async def _ws_db():
    async with async_session() as session:
        yield session


async def _ws_user(token: str, db: AsyncSession) -> User:
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    user = await db.get(User, UUID(payload["sub"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def _ws_require_observer(
    project_id: UUID, user: User, db: AsyncSession
) -> ProjectMember | None:
    """Project member or topic-only collaborator may join the chat channel."""
    member = await db.get(ProjectMember, (project_id, user.id))
    if member:
        if ROLE_HIERARCHY.index(member.role) < ROLE_HIERARCHY.index("observer"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return member
    if await has_any_topic_access_in_project(db, project_id, user.id):
        return None
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")


async def _require_chat_read(
    project_id: UUID,
    topic_node_id: UUID | None,
    current_user: User,
    db: AsyncSession,
) -> None:
    if await has_project_access(db, project_id, current_user.id):
        return
    if topic_node_id and await has_topic_access(
        db, project_id, topic_node_id, current_user.id
    ):
        return
    if topic_node_id is None and await has_any_topic_access_in_project(
        db, project_id, current_user.id
    ):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")


@router.get(
    "/api/projects/{project_id}/thread-sessions",
    response_model=list[ThreadSessionResponse],
)
async def list_thread_sessions(
    project_id: UUID,
    topic_node_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_read(project_id, topic_node_id, current_user, db)
    stmt = (
        select(ThreadSession)
        .where(ThreadSession.project_id == project_id)
        .order_by(ThreadSession.created_at.desc())
    )
    if topic_node_id is not None:
        stmt = stmt.where(ThreadSession.topic_node_id == topic_node_id)
    else:
        stmt = stmt.where(ThreadSession.topic_node_id.is_(None))
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post(
    "/api/projects/{project_id}/thread-sessions",
    response_model=ThreadSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_thread_session(
    project_id: UUID,
    body: ThreadSessionCreate,
    topic_node_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_read(project_id, topic_node_id, current_user, db)
    session = ThreadSession(
        project_id=project_id,
        topic_node_id=topic_node_id,
        title=body.title.strip() or "New thread",
        created_by=current_user.id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.delete(
    "/api/projects/{project_id}/thread-sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_thread_session(
    project_id: UUID,
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(ThreadSession, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    await _require_chat_read(project_id, session.topic_node_id, current_user, db)
    from sqlalchemy import delete as sql_delete

    await db.execute(
        sql_delete(Message).where(Message.thread_session_id == session_id)
    )
    await db.delete(session)
    await db.commit()


@router.patch(
    "/api/projects/{project_id}/thread-sessions/{session_id}",
    response_model=ThreadSessionResponse,
)
async def update_thread_session(
    project_id: UUID,
    session_id: UUID,
    body: ThreadSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(ThreadSession, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    await _require_chat_read(project_id, session.topic_node_id, current_user, db)
    if body.title is not None:
        title = body.title.strip()
        if title:
            session.title = title
    if body.ai_enabled is not None:
        session.ai_enabled = body.ai_enabled
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/api/projects/{project_id}/messages")
async def list_messages(
    project_id: UUID,
    limit: int = Query(default=50, le=200),
    before: datetime | None = Query(default=None),
    topic_node_id: UUID | None = Query(default=None),
    thread_session_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_read(project_id, topic_node_id, current_user, db)
    resolved_session = await resolve_thread_session_id(
        db,
        project_id=project_id,
        topic_node_id=topic_node_id,
        thread_session_id=thread_session_id,
        created_by=current_user.id,
    )
    stmt = (
        select(MessageModel, User.display_name)
        .outerjoin(User, User.id == MessageModel.user_id)
        .where(MessageModel.project_id == project_id)
        .where(MessageModel.thread_session_id == resolved_session)
        .order_by(MessageModel.created_at.desc())
        .limit(limit)
    )
    if topic_node_id is not None:
        stmt = stmt.where(MessageModel.topic_node_id == topic_node_id)
    else:
        stmt = stmt.where(MessageModel.topic_node_id.is_(None))
    if before is not None:
        stmt = stmt.where(MessageModel.created_at < before)

    result = await db.execute(stmt)
    rows = list(result.all())
    rows.reverse()
    msg_ids = [m.id for m, _ in rows]
    mention_map = await mentions_for_message_ids(db, msg_ids)
    by_id = {m.id: (m, sender) for m, sender in rows}
    from app.services.mention_service import reply_preview

    out: list[dict[str, str | bool | list | None]] = []
    for m, name in rows:
        preview = None
        if m.reply_to_id and m.reply_to_id in by_id:
            parent, parent_name = by_id[m.reply_to_id]
            if parent.message_type == "ai":
                plabel = "AI"
            elif parent.is_anonymous:
                plabel = "Anonymous"
            else:
                plabel = parent_name or "Unknown"
            preview = reply_preview(parent, plabel)
        out.append(
            message_payload(
                m,
                sender_display_name=name,
                mentions=mention_map.get(str(m.id), []),
                reply_preview=preview,
            )
        )
    return out


@router.post("/api/projects/{project_id}/messages")
async def create_message(
    project_id: UUID,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """HTTP fallback when the project chat WebSocket is unavailable."""
    await _require_chat_read(project_id, body.topic_node_id, current_user, db)
    if not await has_project_access(db, project_id, current_user.id):
        if body.topic_node_id is None or not await has_topic_access(
            db, project_id, body.topic_node_id, current_user.id
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    resolved_session = await resolve_thread_session_id(
        db,
        project_id=project_id,
        topic_node_id=body.topic_node_id,
        thread_session_id=body.thread_session_id,
        created_by=current_user.id,
    )
    session_ai = False
    row = await db.get(ThreadSession, resolved_session)
    if row and row.project_id == project_id:
        session_ai = row.ai_enabled
    try:
        return await submit_project_chat_message(
            db,
            project_id=project_id,
            user=current_user,
            content=body.content,
            is_anonymous=body.is_anonymous,
            topic_node_id=body.topic_node_id,
            thread_session_id=body.thread_session_id,
            include_ai=body.include_ai,
            session_ai_enabled=session_ai,
            explicit_context=body.explicit_context,
            model=body.model,
            reply_to_id=body.reply_to_id,
            mentioned_user_ids=body.mentioned_user_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/api/projects/{project_id}/messages/{message_id}/ai-stream")
async def stream_message_ai(
    project_id: UUID,
    message_id: UUID,
    model: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE token stream for a thread message that invoked LAED / @ai."""
    msg = await db.get(MessageModel, message_id)
    if not msg or msg.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    await _require_chat_read(project_id, msg.topic_node_id, current_user, db)
    if not await has_project_access(db, project_id, current_user.id):
        if msg.topic_node_id is None or not await has_topic_access(
            db, project_id, msg.topic_node_id, current_user.id
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    return StreamingResponse(
        stream_thread_ai_reply(
            db,
            project_id=project_id,
            human_message_id=message_id,
            requester_id=current_user.id,
            requester_display_name=current_user.display_name,
            model=model,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.websocket("/ws/projects/{project_id}/chat")
async def project_chat_ws(websocket: WebSocket, project_id: UUID):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401, reason="Missing token")
        return

    async with _ws_db() as db:
        try:
            user = await _ws_user(token, db)
            await _ws_require_observer(project_id, user, db)
        except HTTPException as exc:
            code = 4403 if exc.status_code == status.HTTP_403_FORBIDDEN else 4401
            await websocket.close(code=code, reason=exc.detail)
            return

    await websocket.accept()
    redis = _redis()
    pubsub = redis.pubsub()
    channel = f"{CHANNEL_PREFIX}{project_id}"
    await pubsub.subscribe(channel)

    async def relay_pubsub() -> None:
        try:
            async for raw in pubsub.listen():
                if raw.get("type") != "message":
                    continue
                data = raw.get("data")
                if isinstance(data, str):
                    await websocket.send_text(data)
        except asyncio.CancelledError:
            pass

    relay_task = asyncio.create_task(relay_pubsub())

    try:
        while True:
            incoming = await websocket.receive_text()
            try:
                data = json.loads(incoming)
            except json.JSONDecodeError:
                continue
            if data.get("type") != "message":
                continue

            content = str(data.get("content", "")).strip()
            if not content:
                continue
            is_anonymous = bool(data.get("is_anonymous", False))
            include_ai = bool(data.get("include_ai", False))
            topic_raw = data.get("topic_node_id")
            topic_id: UUID | None = None
            if topic_raw is not None:
                try:
                    topic_id = UUID(str(topic_raw))
                except (TypeError, ValueError):
                    continue

            session_raw = data.get("thread_session_id")
            requested_session: UUID | None = None
            if session_raw is not None:
                try:
                    requested_session = UUID(str(session_raw))
                except (TypeError, ValueError):
                    continue

            explicit_raw = data.get("explicit_context")
            explicit_items: list[ExplicitContextItem] = []
            if isinstance(explicit_raw, list):
                for row in explicit_raw:
                    if isinstance(row, dict):
                        try:
                            explicit_items.append(ExplicitContextItem.model_validate(row))
                        except Exception:
                            continue

            model_raw = data.get("model")
            model_choice = (
                str(model_raw).strip()
                if isinstance(model_raw, str) and model_raw.strip()
                else None
            )

            reply_to_id: UUID | None = None
            reply_raw = data.get("reply_to_id")
            if reply_raw is not None:
                try:
                    reply_to_id = UUID(str(reply_raw))
                except (TypeError, ValueError):
                    reply_to_id = None

            mentioned_ids: list[UUID] = []
            raw_mentions = data.get("mentioned_user_ids")
            if isinstance(raw_mentions, list):
                for item in raw_mentions:
                    try:
                        mentioned_ids.append(UUID(str(item)))
                    except (TypeError, ValueError):
                        continue

            async with _ws_db() as db:
                if not await has_project_access(db, project_id, user.id):
                    if topic_id is None or not await has_topic_access(
                        db, project_id, topic_id, user.id
                    ):
                        continue
                session_ai = False
                if requested_session is not None:
                    row = await db.get(ThreadSession, requested_session)
                    if row and row.project_id == project_id:
                        session_ai = row.ai_enabled
                try:
                    await submit_project_chat_message(
                        db,
                        project_id=project_id,
                        user=user,
                        content=content,
                        is_anonymous=is_anonymous,
                        topic_node_id=topic_id,
                        thread_session_id=requested_session,
                        include_ai=include_ai,
                        session_ai_enabled=session_ai,
                        explicit_context=explicit_items,
                        model=model_choice,
                        reply_to_id=reply_to_id,
                        mentioned_user_ids=mentioned_ids,
                    )
                except ValueError:
                    continue

    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        try:
            await relay_task
        except asyncio.CancelledError:
            pass
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        await redis.close()
