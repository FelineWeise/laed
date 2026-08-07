"use client";

import { useState } from "react";
import type { SourceChunk } from "@/lib/types";
import { dedupeSourceChunks, formatSourceLabels } from "@/lib/sourceChunks";

type Props = {
  chunks: SourceChunk[] | null | undefined;
};

export function MessageSources({ chunks }: Props) {
  const [open, setOpen] = useState(false);
  if (!chunks || chunks.length === 0) return null;

  const deduped = dedupeSourceChunks(chunks);
  const labels = formatSourceLabels(chunks);

  return (
    <div className="mt-1">
      <button
        type="button"
        className="text-[length:var(--laed-size-caption)] tracking-[0.5px] text-[var(--laed-muted)] hover:text-[var(--laed-ink)]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide sources" : "Show sources"}
      </button>
      {open ? (
        <ul className="mt-1 space-y-1 text-[length:var(--laed-size-caption)] text-[var(--laed-muted)]">
          {deduped.map((c, i) => (
            <li key={`${c.document_id ?? c.filename}-${i}`}>
              <span className="font-medium text-[var(--laed-ink)]">{c.filename}</span>
              {c.excerpt ? (
                <span className="block opacity-80">{c.excerpt.slice(0, 120)}…</span>
              ) : null}
            </li>
          ))}
          {labels.length > 0 && deduped.length === 0 ? (
            <li>{labels.join(", ")}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
