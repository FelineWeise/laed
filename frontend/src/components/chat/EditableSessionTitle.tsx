"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  placeholder?: string;
  onSave: (title: string) => void;
  className?: string;
  heading?: boolean;
};

export function EditableSessionTitle({
  value,
  placeholder = "Untitled",
  onSave,
  className = "",
  heading = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed !== value.trim()) {
        onSave(trimmed);
      }
      setEditing(false);
    },
    [onSave, value],
  );

  const scheduleSave = useCallback(
    (next: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const trimmed = next.trim();
        if (trimmed !== value.trim()) {
          onSave(trimmed);
        }
      }, 300);
    },
    [onSave, value],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          scheduleSave(e.target.value);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={`min-w-0 border border-[var(--laed-private-border)] bg-white px-2 py-0.5 text-[10px] font-medium outline-none ${className}`.trim()}
        style={{ borderRadius: "var(--laed-radius-sm)" }}
        aria-label="Session title"
      />
    );
  }

  const Tag = heading ? "h2" : "span";
  return (
    <Tag
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={`cursor-pointer truncate text-[var(--laed-ink)] hover:underline ${heading ? "text-[11px] font-semibold tracking-[1px] uppercase" : "text-[10px] font-medium"} ${className}`.trim()}
      title="Click to rename"
    >
      {value.trim() || placeholder}
    </Tag>
  );
}
