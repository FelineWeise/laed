"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ThreadSession } from "@/lib/types";

export function sessionLabel(session: ThreadSession): string {
  const title = session.title.trim();
  if (title !== "" && title !== "Main") {
    return title;
  }
  const d = new Date(session.created_at);
  return `Thread · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function useThreadSessions(
  projectId: string,
  topicNodeId: string | null,
  enabled: boolean,
) {
  const [sessions, setSessions] = useState<ThreadSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);

  const query =
    topicNodeId !== null
      ? `?topic_node_id=${encodeURIComponent(topicNodeId)}`
      : "";

  const listPath = `/api/projects/${projectId}/thread-sessions${query}`;
  const createPath = listPath;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<ThreadSession[]>(listPath);
      setSessions(list);
      return list;
    } finally {
      setLoading(false);
    }
  }, [listPath]);

  const ensureSelected = useCallback(async (list: ThreadSession[]) => {
    if (list.length === 0) {
      const created = await apiFetch<ThreadSession>(createPath, {
        method: "POST",
        body: JSON.stringify({ title: "New thread" }),
      });
      setSessions([created]);
      setSelectedId(created.id);
      return created.id;
    }
    const latest = list[0];
    if (latest !== undefined) {
      setSelectedId((current) =>
        current !== "" && list.some((s) => s.id === current) ? current : latest.id,
      );
    }
    return list[0]?.id ?? "";
  }, [createPath]);

  useEffect(() => {
    if (!enabled) return;
    setSelectedId("");
    void refresh().then((list) => void ensureSelected(list));
  }, [enabled, projectId, topicNodeId, refresh, ensureSelected]);

  const createNew = useCallback(async () => {
    const created = await apiFetch<ThreadSession>(createPath, {
      method: "POST",
      body: JSON.stringify({ title: "New thread" }),
    });
    setSessions((prev) => [created, ...prev]);
    setSelectedId(created.id);
    return created.id;
  }, [createPath]);

  const setAiEnabled = useCallback(
    async (sessionId: string, enabled: boolean) => {
      const updated = await apiFetch<ThreadSession>(
        `/api/projects/${projectId}/thread-sessions/${sessionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ ai_enabled: enabled }),
        },
      );
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? updated : s)),
      );
      return updated;
    },
    [projectId],
  );

  const remove = useCallback(
    async (sessionId: string) => {
      await apiFetch(
        `/api/projects/${projectId}/thread-sessions/${sessionId}`,
        { method: "DELETE" },
      );
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        if (selectedId === sessionId) {
          setSelectedId(next[0]?.id ?? "");
        }
        return next;
      });
    },
    [projectId, selectedId],
  );

  const selectedSession =
    sessions.find((s) => s.id === selectedId) ?? null;

  return {
    sessions,
    selectedId,
    setSelectedId,
    selectedSession,
    createNew,
    remove,
    loading,
    refresh,
    sessionLabel,
    setAiEnabled,
  };
}
