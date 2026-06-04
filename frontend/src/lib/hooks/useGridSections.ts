"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { GridSection } from "@/lib/types";

export function useGridSections(enabled: boolean) {
  const [sections, setSections] = useState<GridSection[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<GridSection[]>("/api/users/me/grid-sections");
      setSections(list);
      return list;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const createSection = useCallback(
    async (name: string, tagFilters: string[] = []) => {
      const row = await apiFetch<GridSection>("/api/users/me/grid-sections", {
        method: "POST",
        body: JSON.stringify({
          name,
          tag_filters: tagFilters,
          sort_order: sections.length,
          bounds: { x: 20, y: 40, w: 160, h: 120 },
        }),
      });
      setSections((prev) => [...prev, row]);
      return row;
    },
    [sections.length],
  );

  const updateSection = useCallback(
    async (
      id: string,
      patch: {
        name?: string;
        sort_order?: number;
        tag_filters?: string[];
        bounds?: { x: number; y: number; w: number; h: number };
      },
    ) => {
      const row = await apiFetch<GridSection>(`/api/users/me/grid-sections/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setSections((prev) => prev.map((s) => (s.id === id ? row : s)));
      return row;
    },
    [],
  );

  return { sections, loading, refresh, createSection, updateSection };
}
