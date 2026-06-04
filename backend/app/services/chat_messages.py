"""Persist project chat messages and broadcast on Redis."""

from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message as MessageModel
from app.models.thread_session import ThreadSession
from app.models.user import User
from app.schemas.context import ExplicitContextItem
from app.services.chat_broadcast import CHANNEL_PREFIX, chat_redis, message_payload
from app.services.mention_service import (
    reply_preview,
    resolve_mentions_for_send,
    save_message_mentions,
    validate_reply_to,
)
from app.services.thread_ai import should_invoke_thread_ai
from app.services.thread_sessions import maybe_title_from_message, resolve_thread_session_id

__all__ = [
    "CHANNEL_PREFIX",
    "chat_redis",
    "message_payload",
    "submit_project_chat_message",
]


async def submit_project_chat_message(
    db: AsyncSession,
    *,
    project_id: UUID,
    user: User,
    content: str,
    is_anonymous: bool = False,
    topic_node_id: UUID | None = None,
    thread_session_id: UUID | None = None,
    include_ai: bool = False,
    session_ai_enabled: bool = False,
    explicit_context: list[ExplicitContextItem] | None = None,
    model: str | None = None,
    reply_to_id: UUID | None = None,
    mentioned_user_ids: list[UUID] | None = None,
) -> dict[str, str | bool | list | None]:
    """Save message, publish to Redis, optionally run @ai reply."""
    text = content.strip()
    if not text:
        raise ValueError("Message content is required")

    should_ai = should_invoke_thread_ai(
        text, include_ai=include_ai, session_ai_enabled=session_ai_enabled
    )

    resolved_session = await resolve_thread_session_id(
        db,
        project_id=project_id,
        topic_node_id=topic_node_id,
        thread_session_id=thread_session_id,
        created_by=user.id,
    )
    parent = await validate_reply_to(
        db,
        project_id=project_id,
        thread_session_id=resolved_session,
        reply_to_id=reply_to_id,
    )

    mention_ids = await resolve_mentions_for_send(
        db,
        project_id=project_id,
        content=text,
        explicit_ids=mentioned_user_ids,
    )

    session_row = await db.get(ThreadSession, resolved_session)
    msg = MessageModel(
        project_id=project_id,
        user_id=user.id,
        content=text,
        is_anonymous=is_anonymous,
        topic_node_id=topic_node_id,
        thread_session_id=resolved_session,
        triggered_ai=should_ai,
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    if session_row is not None:
        session_row.title = maybe_title_from_message(session_row.title, text)
    await db.commit()
    await db.refresh(msg)

    mention_snapshots = await save_message_mentions(
        db,
        message_id=msg.id,
        mentioned_user_ids=mention_ids,
    )

    preview = None
    if parent is not None:
        from app.models.user import User as UserModel

        parent_sender = "AI" if parent.message_type == "ai" else None
        if parent_sender is None and parent.user_id:
            author = await db.get(UserModel, parent.user_id)
            if author:
                parent_sender = author.display_name or author.email
        if parent.is_anonymous:
            parent_sender = "Anonymous"
        preview = reply_preview(parent, parent_sender or "Unknown")

    outbound = message_payload(
        msg,
        sender_display_name=user.display_name,
        mentions=mention_snapshots,
        reply_preview=preview,
    )
    if should_ai:
        outbound["invoke_ai"] = True
    redis = chat_redis()
    channel = f"{CHANNEL_PREFIX}{project_id}"
    await redis.publish(channel, json.dumps(outbound))
    await redis.aclose()

    payload = dict(outbound)
    payload["invoke_ai"] = should_ai
    return payload
