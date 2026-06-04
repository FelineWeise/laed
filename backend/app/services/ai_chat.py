from __future__ import annotations

import json
from collections.abc import AsyncIterator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai import AIMessage
from app.schemas.ai import MessageCreate
from app.services.harness import build_system_prompt
from app.services.llm import llm_stream
from app.services.llm_messages import flatten_messages_for_stream
from app.services.rag import build_source_chunks, get_rag
from app.services.retrieval.resolve import resolve_retrieval_scope


def resolve_model(body: MessageCreate) -> str:
    return body.model or settings.llm_model


def format_excerpts(hits: list[dict[str, object]]) -> str:
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


async def build_workspace_system(db: AsyncSession, *, user_id: UUID) -> str:
    from app.services.chat_context import CONCISE_INSTRUCTION

    harness = await build_system_prompt(db, user_id=user_id, project_id=None)
    if harness:
        return f"{harness}\n\n{CONCISE_INSTRUCTION}"
    return f"You are a helpful workspace assistant.\n\n{CONCISE_INSTRUCTION}"


RAG_INSTRUCTION = (
    "Use the retrieved project excerpts below as your primary source. "
    "When excerpts are insufficient or broader expertise is relevant, supplement with "
    "your general knowledge and clearly say when you are using general knowledge versus "
    "project documents.\n\n"
)


async def build_project_system(
    db: AsyncSession,
    *,
    user_id: UUID,
    project_id: UUID,
    user_content: str,
    body: MessageCreate,
    scope: object | None = None,
) -> tuple[str, list[dict[str, object]]]:
    harness = await build_system_prompt(db, user_id=user_id, project_id=project_id)
    resolved_scope = scope
    if resolved_scope is None:
        resolved_scope = await resolve_retrieval_scope(project_id, body, db, user_id=user_id)
    retriever = get_rag(project_id)
    hits = await retriever.query(
        user_content,
        scope=resolved_scope,
        top_k=5,
        viewer_user_id=str(user_id),
    )
    excerpts = format_excerpts(hits)
    rag_block = (
        f"{RAG_INSTRUCTION}Excerpts:\n{excerpts if excerpts else '(none)'}"
    )
    parts: list[str] = []
    if harness:
        parts.append(harness)
    parts.append(rag_block)
    return "\n\n".join(parts), hits


def stream_assistant_reply(
    db: AsyncSession,
    *,
    conv_id: UUID,
    messages: list[dict[str, str]],
    model: str,
    source_hits: list[dict[str, object]] | None = None,
    index_project_id: UUID | None = None,
    index_user_text: str | None = None,
    index_topic_node_id: UUID | None = None,
    index_source: str = "conversation",
) -> AsyncIterator[str]:
    hits = source_hits or []

    async def event_stream() -> AsyncIterator[str]:
        full_parts: list[str] = []
        try:
            stream_messages = flatten_messages_for_stream(messages)
            async for token in llm_stream(stream_messages, model=model, max_tokens=None):
                full_parts.append(token)
                payload = json.dumps({"content": token})
                yield f"event: token\ndata: {payload}\n\n"
        except Exception as exc:
            err = json.dumps({"error": str(exc)})
            yield f"event: error\ndata: {err}\n\n"
            return

        assistant_text = "".join(full_parts).strip()
        if not assistant_text:
            assistant_text = "I could not generate a reply."
        source_chunks = build_source_chunks(hits) if hits else None
        assistant = AIMessage(
            conversation_id=conv_id,
            role="assistant",
            content=assistant_text,
            source_chunks=source_chunks,
        )
        db.add(assistant)
        await db.commit()
        await db.refresh(assistant)

        if index_project_id and index_user_text:
            from app.services.conversation_index import index_conversation_turn

            index_conversation_turn.delay(
                str(index_project_id),
                index_user_text,
                assistant_text,
                conversation_id=str(conv_id),
                topic_node_id=str(index_topic_node_id) if index_topic_node_id else None,
                source=index_source,
            )

        done_payload = json.dumps(
            {
                "message_id": str(assistant.id),
                "source_chunks": source_chunks,
            }
        )
        yield f"event: done\ndata: {done_payload}\n\n"

    return event_stream()
