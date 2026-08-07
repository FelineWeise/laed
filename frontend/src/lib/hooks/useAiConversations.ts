"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Conversation, ConversationPatch } from "@/lib/types";

type Options = {
  projectId?: string;
  enabled: boolean;
  linkedThreadSessionId?: string | null;
  topicNodeId?: string | null;
};

export function conversationLabel(conv: Conversation): string {
  if (conv.title && conv.title.trim() !== "") {
    return conv.title.trim();
  }
  const d = new Date(conv.created_at);
  return `Chat · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function useAiConversations({
  projectId,
  enabled,
  linkedThreadSessionId = null,
  topicNodeId = null,
}: Options) {
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
          body: JSON.stringify({
            is_private: true,
            linked_thread_session_id: linkedThreadSessionId,
            topic_node_id: topicNodeId,
          }),
        });
        setConversations([created]);
        setSelectedId(created.id);
        return created.id;
      }
      const linked =
        linkedThreadSessionId !== null && linkedThreadSessionId !== ""
          ? list.find((c) => c.linked_thread_session_id === linkedThreadSessionId)
          : undefined;
      const pick = linked ?? list[0];
      if (pick !== undefined) {
        setSelectedId((current) =>
          current !== "" && list.some((c) => c.id === current) ? current : pick.id,
        );
      }
      return pick?.id ?? "";
    },
    [createPath, linkedThreadSessionId, topicNodeId],
  );

  useEffect(() => {
    if (!enabled) return;
    void refresh().then((list) => void ensureSelected(list));
  }, [enabled, refresh, ensureSelected]);

  const createNew = useCallback(async () => {
    const created = await apiFetch<Conversation>(createPath, {
      method: "POST",
      body: JSON.stringify({
        is_private: true,
        linked_thread_session_id: linkedThreadSessionId,
        topic_node_id: topicNodeId,
      }),
    });
    setConversations((prev) => [created, ...prev]);
    setSelectedId(created.id);
    return created.id;
  }, [createPath, linkedThreadSessionId, topicNodeId]);

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

  const updateConversation = useCallback(
    async (convId: string, patch: ConversationPatch) => {
      const patchPath =
        projectId !== undefined
          ? `/api/projects/${projectId}/ai/conversations/${convId}`
          : `/api/ai/conversations/${convId}`;
      const updated = await apiFetch<Conversation>(patchPath, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? updated : c)),
      );
      return updated;
    },
    [projectId],
  );

  const selected =
    conversations.find((c) => c.id === selectedId) ?? null;

  return {
    conversations,
    selectedId,
    setSelectedId,
    selected,
    createNew,
    remove,
    updateConversation,
    loading,
    refresh,
    conversationLabel,
  };
}
