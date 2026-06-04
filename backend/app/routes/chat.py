from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import ROLE_HIERARCHY, require_project_role
from app.auth.jwt import decode_access_token
from app.config import settings
from app.models import User, ProjectMember, get_db
from app.models.base import async_session
from app.models.message import Message as MessageModel

router = APIRouter(tags=["chat"])

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
) -> ProjectMember:
    """Same membership rules as require_project_role('observer') for WebSocket handshakes."""
    member = await db.get(ProjectMember, (project_id, user.id))
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
    if ROLE_HIERARCHY.index(member.role) < ROLE_HIERARCHY.index("observer"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    return member


def _message_payload(
    msg: MessageModel,
    *,
    sender_display_name: str | None = None,
) -> dict[str, str | bool | None]:
    if msg.is_anonymous:
        sender_label = "Anonymous"
        user_id: str | None = None
    else:
        sender_label = sender_display_name or "Unknown"
        user_id = str(msg.user_id) if msg.user_id else None
    return {
        "type": "message",
        "id": str(msg.id),
        "content": msg.content,
        "is_anonymous": msg.is_anonymous,
        "topic_node_id": str(msg.topic_node_id) if msg.topic_node_id else None,
        "sender_label": sender_label,
        "user_id": user_id,
        "created_at": msg.created_at.isoformat(),
    }


@router.get("/api/projects/{project_id}/messages")
async def list_messages(
    project_id: UUID,
    limit: int = Query(default=50, le=200),
    before: datetime | None = Query(default=None),
    topic_node_id: UUID | None = Query(default=None),
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(MessageModel, User.display_name)
        .outerjoin(User, User.id == MessageModel.user_id)
        .where(MessageModel.project_id == project_id)
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
    return [
        _message_payload(m, sender_display_name=name)
        for m, name in rows
    ]


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
            topic_raw = data.get("topic_node_id")
            topic_id: UUID | None = None
            if topic_raw is not None:
                try:
                    topic_id = UUID(str(topic_raw))
                except (TypeError, ValueError):
                    continue

            async with _ws_db() as db:
                msg = MessageModel(
                    project_id=project_id,
                    user_id=user.id,
                    content=content,
                    is_anonymous=is_anonymous,
                    topic_node_id=topic_id,
                )
                db.add(msg)
                await db.commit()
                await db.refresh(msg)

            outbound = _message_payload(msg, sender_display_name=user.display_name)
            await redis.publish(channel, json.dumps(outbound))

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
