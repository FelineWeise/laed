"""Thread @ai / LAED-toggle replies with streaming."""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.message import Message
from app.schemas.ai import MessageCreate
from app.schemas.context import ExplicitContextItem
from app.services.ai_chat import iter_assistant_tokens
from app.services.agent_loop import run_agent_loop
from app.services.chat_context import build_chat_context
from app.services.chat_broadcast import CHANNEL_PREFIX, chat_redis, message_payload
from app.services.conversation_index import index_conversation_turn
from app.services.embedding_errors import OssEmbeddingUnavailable
from app.services.rag import build_source_chunks

AI_MENTION = re.compile(r"@(?:ai|laed)\b", re.IGNORECASE)


def message_triggers_ai(content: str, *, triggered_flag: bool = False) -> bool:
    if triggered_flag:
        return True
    return bool(AI_MENTION.search(content))


def should_invoke_thread_ai(
    content: str,
    *,
    include_ai: bool = False,
    session_ai_enabled: bool = False,
) -> bool:
    if include_ai or session_ai_enabled:
        return True
    return message_triggers_ai(content)


def strip_ai_mention(content: str) -> str:
    return AI_MENTION.sub("", content).strip()


async def stream_thread_ai_reply(
    db: AsyncSession,
    *,
    project_id: UUID,
    human_message_id: UUID,
    requester_id: UUID,
    requester_display_name: str,
    model: str | None = None,
    embedding_model: str | None = None,
) -> AsyncIterator[str]:
    """SSE: token events, then persist AI message and publish to project chat channel."""
    human = await db.get(Message, human_message_id)
    if not human or human.project_id != project_id:
        err = json.dumps({"error": "Message not found"})
        yield f"event: error\ndata: {err}\n\n"
        return

    existing = await db.execute(
        select(Message).where(
            Message.reply_to_id == human_message_id,
            Message.message_type == "ai",
        )
    )
    prior = existing.scalar_one_or_none()
    if prior is not None:
        done_payload = json.dumps(
            {"message_id": str(prior.id), "source_chunks": prior.source_chunks}
        )
        yield f"event: done\ndata: {done_payload}\n\n"
        return

    prompt_text = strip_ai_mention(human.content) or human.content
    body = MessageCreate(
        content=prompt_text,
        topic_node_id=human.topic_node_id,
        explicit_context=[],
        model=model,
        embedding_model=embedding_model,
    )
    try:
        system, llm_messages, hits = await build_chat_context(
            db,
            user_id=requester_id,
            project_id=project_id,
            body=body,
            mode="project",
            thread_history=True,
            thread_session_id=human.thread_session_id,
        )
    except OssEmbeddingUnavailable as exc:
        yield (
            "event: error\ndata: "
            + json.dumps(
                {
                    "code": "oss_embedding_unavailable",
                    "message": str(exc),
                }
            )
            + "\n\n"
        )
        return
    except Exception as exc:
        yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        return

    llm_model = (model or "").strip() or settings.llm_model
    full_messages = [{"role": "system", "content": system}, *llm_messages]
    if not llm_messages:
        yield f"event: error\ndata: {json.dumps({'error': 'No messages to send to the model'})}\n\n"
        return
    full_messages, direct_reply = await run_agent_loop(full_messages, model=llm_model)

    full_parts: list[str] = []
    try:
        async for token in iter_assistant_tokens(
            full_messages, model=llm_model, direct_reply=direct_reply
        ):
            full_parts.append(token)
            yield f"event: token\ndata: {json.dumps({'content': token})}\n\n"
    except ValueError as exc:
        yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        return
    except Exception as exc:
        yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        return

    assistant_text = "".join(full_parts).strip() or "I could not generate a reply."
    source_chunks = build_source_chunks(hits) if hits else None
    ai_msg = Message(
        project_id=project_id,
        user_id=None,
        content=assistant_text,
        is_anonymous=False,
        message_type="ai",
        topic_node_id=human.topic_node_id,
        thread_session_id=human.thread_session_id,
        reply_to_id=human_message_id,
        triggered_ai=False,
        source_chunks=source_chunks,
    )
    db.add(ai_msg)
    await db.commit()
    await db.refresh(ai_msg)

    redis = chat_redis()
    channel = f"{CHANNEL_PREFIX}{project_id}"
    await redis.publish(
        channel,
        json.dumps(message_payload(ai_msg, sender_display_name="AI")),
    )
    await redis.aclose()

    index_conversation_turn.delay(
        str(project_id),
        prompt_text,
        assistant_text,
        conversation_id=str(human_message_id),
        topic_node_id=str(human.topic_node_id) if human.topic_node_id else None,
        source="thread",
    )

    done_payload = json.dumps(
        {
            "message_id": str(ai_msg.id),
            "source_chunks": source_chunks,
            "content": assistant_text,
        }
    )
    yield f"event: done\ndata: {done_payload}\n\n"
