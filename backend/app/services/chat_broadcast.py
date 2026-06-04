"""Redis pub/sub helpers and wire format for project chat."""

from __future__ import annotations

from redis.asyncio import Redis

from app.config import settings
from app.models.message import Message as MessageModel

CHANNEL_PREFIX = "chat:"


def chat_redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def message_payload(
    msg: MessageModel,
    *,
    sender_display_name: str | None = None,
    mentions: list[dict[str, str]] | None = None,
    reply_preview: dict[str, str] | None = None,
) -> dict[str, str | bool | list | None]:
    if msg.message_type == "ai":
        sender_label = "AI"
        user_id = None
    elif msg.is_anonymous:
        sender_label = "Anonymous"
        user_id = None
    else:
        sender_label = sender_display_name or "Unknown"
        user_id = str(msg.user_id) if msg.user_id else None
    return {
        "type": "message",
        "id": str(msg.id),
        "content": msg.content,
        "is_anonymous": msg.is_anonymous,
        "message_type": msg.message_type,
        "topic_node_id": str(msg.topic_node_id) if msg.topic_node_id else None,
        "sender_label": sender_label,
        "user_id": user_id,
        "created_at": msg.created_at.isoformat(),
        "source_chunks": msg.source_chunks,
        "reply_to_id": str(msg.reply_to_id) if msg.reply_to_id else None,
        "thread_session_id": str(msg.thread_session_id) if msg.thread_session_id else None,
        "mentions": mentions or [],
        "reply_preview": reply_preview,
    }
