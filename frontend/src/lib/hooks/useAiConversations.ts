"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Conversation } from "@/lib/types";

type Options = {
  projectId?: string;
  enabled: boolean;
};

export function conversationLabel(conv: Conversation): string {
  if (conv.title && conv.title.trim() !== "") {
    return conv.title.trim();
  }
  const d = new Date(conv.created_at);
  return `Chat · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function useAiConversations({ projectId, enabled }: Options) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);

  const listPath =
    projectId !== undefined
      ? `/api/projects/${projectId}/ai/conversations`
      : "/api/ai/conversations";
  const createPath =
    projectId !== undefined
      ? `/api/projects/${projectId}/ai/conversations`
      : "/api/ai/conversations";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<Conversation[]>(listPath);
      setConversations(list);
      return list;
    } finally {
      setLoading(false);
    }
  }, [listPath]);

  const ensureSelected = useCallback(
    async (list: Conversation[]) => {
      if (list.length === 0) {
        const created = await apiFetch<Conversation>(createPath, {
          method: "POST",
          body: JSON.stringify({ is_private: true }),
        });
        setConversations([created]);
        setSelectedId(created.id);
        return created.id;
      }
      const latest = list[0];
      if (latest !== undefined) {
        setSelectedId((current) =>
          current !== "" && list.some((c) => c.id === current) ? current : latest.id,
        );
      }
      return list[0]?.id ?? "";
    },
    [createPath],
  );

  useEffect(() => {
    if (!enabled) return;
    void refresh().then((list) => void ensureSelected(list));
  }, [enabled, refresh, ensureSelected]);

  const createNew = useCallback(async () => {
    const created = await apiFetch<Conversation>(createPath, {
      method: "POST",
      body: JSON.stringify({ is_private: true }),
    });
    setConversations((prev) => [created, ...prev]);
    setSelectedId(created.id);
    return created.id;
  }, [createPath]);

  const remove = useCallback(
    async (convId: string) => {
      const deletePath =
        projectId !== undefined
          ? `/api/projects/${projectId}/ai/conversations/${convId}`
          : `/api/ai/conversations/${convId}`;
      await apiFetch(deletePath, { method: "DELETE" });
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== convId);
        if (selectedId === convId) {
          const fallback = next[0]?.id ?? "";
          setSelectedId(fallback);
        }
        return next;
      });
    },
    [projectId, selectedId],
  );

  return {
    conversations,
    selectedId,
    setSelectedId,
    createNew,
    remove,
    loading,
    refresh,
    conversationLabel,
  };
}
