"use client";

import { useEffect, useMemo, useState } from "react";
import type { Member } from "@/lib/types";
import { mentionLabel } from "@/lib/mentionUtils";

type Props = {
  members: Member[];
  draft: string;
  onInsert: (nextDraft: string, cursorAfter: number) => void;
};

export function MentionAutocomplete({ members, draft, onInsert }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const context = useMemo(() => {
    const at = draft.lastIndexOf("@");
    if (at < 0) return null;
    const after = draft.slice(at + 1);
    if (after.includes("\n")) return null;
    const space = after.indexOf(" ");
    if (space >= 0 && space < after.length - 1) return null;
    const query = after.trim().toLowerCase();
    return { at, query };
  }, [draft]);

  const options = useMemo(() => {
    if (!context) return [];
    const q = context.query;
    return members
      .filter((m) => {
        const label = mentionLabel(m).toLowerCase();
        const email = (m.email ?? "").toLowerCase();
        if (!q) return true;
        return label.includes(q) || email.includes(q);
      })
      .slice(0, 8);
  }, [context, members]);

  useEffect(() => {
    setActiveIndex(0);
  }, [options.length, context?.query]);

  if (!context || options.length === 0) return null;

  function pick(member: Member) {
    if (!context) return;
    const label = mentionLabel(member);
    const before = draft.slice(0, context.at);
    const next = `${before}@${label} `;
    onInsert(next, next.length);
  }

  return (
    <ul
      className="absolute bottom-full left-0 z-10 mb-1 max-h-40 w-full overflow-y-auto border border-[var(--laed-border)] bg-white shadow-[var(--laed-shadow-pop)]"
      style={{ borderRadius: "var(--laed-radius-sm)" }}
    >
      {options.map((m, i) => (
        <li key={m.user_id}>
          <button
            type="button"
            className={`w-full px-3 py-2 text-left text-[10px] hover:bg-[var(--laed-paper)] ${
              i === activeIndex ? "bg-[var(--laed-paper)]" : ""
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(m);
            }}
          >
            <span className="font-medium text-[var(--laed-ink)]">
              {mentionLabel(m)}
            </span>
            {m.email ? (
              <span className="ml-2 text-[var(--laed-muted)]">{m.email}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
