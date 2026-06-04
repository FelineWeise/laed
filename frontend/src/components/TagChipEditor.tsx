"use client";

import { useState } from "react";

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

function parseInput(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function TagChipEditor({ tags, onChange }: Props) {
  const [draft, setDraft] = useState("");

  function addTags(raw: string) {
    const next = parseInput(raw);
    if (next.length === 0) return;
    const merged = [...tags];
    for (const t of next) {
      if (!merged.includes(t)) merged.push(t);
    }
    onChange(merged);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="mt-3">
      <span className="laed-label mb-1 block">Tags</span>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--laed-border)] bg-white px-2 py-0.5 text-[9px] text-[var(--laed-ink)]"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="cursor-pointer border-none bg-transparent p-0 text-[var(--laed-muted)] hover:text-red-700"
              aria-label={`Remove tag ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTags(draft);
          }
        }}
        onBlur={() => {
          if (draft.trim()) addTags(draft);
        }}
        className="mt-1.5 w-full border border-[var(--laed-border)] bg-white px-2 py-1 text-[9px]"
        placeholder="Add tag, Enter"
      />
    </div>
  );
}
