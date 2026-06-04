from __future__ import annotations

from app.models.ai import AIConversation


def title_from_first_message(content: str) -> str:
    snippet = content.strip()[:60]
    return snippet if snippet else "Chat"


async def ensure_conversation_title(
    conv: AIConversation,
    content: str,
) -> None:
    if conv.title is None or conv.title.strip() == "":
        conv.title = title_from_first_message(content)
