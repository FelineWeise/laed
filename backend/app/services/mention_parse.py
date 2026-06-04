"""Parse @mentions of project members in thread messages."""

from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

RESERVED_MENTION = frozenset({"ai", "laed"})
MENTION_TOKEN = re.compile(r"@([^\s@]+(?:\s+[^\s@]+)*)")


@dataclass(frozen=True)
class MentionableMember:
    user_id: UUID
    display_name: str
    email: str


def _match_keys(member: MentionableMember) -> list[str]:
    keys: list[str] = []
    name = member.display_name.strip()
    if name:
        keys.append(name.lower())
    local = member.email.split("@", 1)[0].strip().lower()
    if local:
        keys.append(local)
    return keys


def parse_user_mentions(
    content: str,
    members: list[MentionableMember],
    *,
    extra_user_ids: list[UUID] | None = None,
) -> list[UUID]:
    """Resolve @tokens to project member user IDs (longest match, case-insensitive)."""
    by_key: dict[str, UUID] = {}
    for member in members:
        for key in _match_keys(member):
            if key not in by_key:
                by_key[key] = member.user_id

    found: list[UUID] = []
    seen: set[UUID] = set()

    def add(uid: UUID) -> None:
        if uid not in seen:
            seen.add(uid)
            found.append(uid)

    if extra_user_ids:
        for uid in extra_user_ids:
            add(uid)

    for match in MENTION_TOKEN.finditer(content):
        raw = match.group(1).strip()
        if not raw:
            continue
        first_word = raw.split()[0].lower()
        if first_word in RESERVED_MENTION:
            continue
        key = raw.lower()
        uid = by_key.get(key)
        if uid is not None:
            add(uid)
            continue
        # Try progressively shorter prefixes (display names with spaces)
        parts = raw.split()
        for end in range(len(parts), 0, -1):
            partial = " ".join(parts[:end]).lower()
            uid = by_key.get(partial)
            if uid is not None:
                add(uid)
                break

    return found
