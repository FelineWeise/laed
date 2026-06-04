"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { UserSearchResult } from "@/lib/types";

export function useDebouncedUserSearch(query: string, delayMs = 300) {
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handle = window.setTimeout(() => {
      void apiFetch<UserSearchResult[]>(
        `/api/users/search?q=${encodeURIComponent(trimmed)}`,
      )
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, delayMs);

    return () => window.clearTimeout(handle);
  }, [query, delayMs]);

  return { results, loading };
}
