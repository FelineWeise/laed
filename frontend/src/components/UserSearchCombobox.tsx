"use client";

import { useState } from "react";
import { useDebouncedUserSearch } from "@/lib/hooks/useDebouncedUserSearch";
import type { UserSearchResult } from "@/lib/types";

type Props = {
  onSelect: (user: UserSearchResult) => void;
  disabled?: boolean;
};

export function UserSearchCombobox({ onSelect, disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { results, loading } = useDebouncedUserSearch(query);

  function pick(user: UserSearchResult) {
    onSelect(user);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder="Search by email or name…"
        className="laed-input-pill w-full"
      />
      {open && query.trim().length >= 2 ? (
        <ul
          className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto border border-[var(--laed-border)] bg-white shadow-sm"
          style={{ borderRadius: "var(--laed-radius-sm)" }}
        >
          {loading ? (
            <li className="px-3 py-2 text-[9px] text-[var(--laed-muted)]">Searching…</li>
          ) : null}
          {!loading && results.length === 0 ? (
            <li className="px-3 py-2 text-[9px] text-[var(--laed-muted)]">No users found</li>
          ) : null}
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-[10px] hover:bg-[rgba(26,25,23,0.04)]"
                onClick={() => pick(u)}
              >
                <span className="font-medium text-[var(--laed-ink)]">{u.display_name}</span>
                <span className="ml-2 text-[var(--laed-muted)]">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
