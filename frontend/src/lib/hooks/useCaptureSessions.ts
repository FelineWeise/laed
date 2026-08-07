"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CaptureSessionPatch } from "@/lib/capturePatch";
import type { CaptureSession } from "@/lib/types";

export function captureSessionLabel(session: CaptureSession): string {
  const title = session.title.trim();
  if (title) return title;
  const d = new Date(session.created_at);
  return `${session.kind === "spoken" ? "Spoken" : "Camera"} · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function useCaptureSessions(kind: "spoken" | "camera", enabled: boolean) {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);

  const listPath = `/api/capture/sessions?kind=${kind}`;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<CaptureSession[]>(listPath);
      setSessions(list);
      return list;
    } finally {
      setLoading(false);
    }
  }, [listPath]);

  const createNew = useCallback(
    async (opts?: { capture_mode?: CaptureSessionPatch["capture_mode"] }) => {
      const created = await apiFetch<CaptureSession>("/api/capture/sessions", {
        method: "POST",
        body: JSON.stringify({
          kind,
          is_private: true,
          ...(opts?.capture_mode ? { capture_mode: opts.capture_mode } : {}),
        }),
      });
      setSessions((prev) => [created, ...prev]);
      setSelectedId(created.id);
      return created;
    },
    [kind],
  );

  const remove = useCallback(
    async (sessionId: string) => {
      await apiFetch(`/api/capture/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        if (selectedId === sessionId) {
          setSelectedId(next[0]?.id ?? "");
        }
        return next;
      });
    },
    [selectedId],
  );

  const updateSession = useCallback(
    async (sessionId: string, patch: CaptureSessionPatch) => {
      const updated = await apiFetch<CaptureSession>(
        `/api/capture/sessions/${sessionId}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? updated : s)),
      );
      return updated;
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    void refresh().then((list) => {
      setSelectedId((cur) => (cur !== "" ? cur : list[0]?.id ?? ""));
    });
  }, [enabled, refresh]);

  const selected =
    sessions.find((s) => s.id === selectedId) ?? null;

  return {
    sessions,
    selectedId,
    setSelectedId,
    selected,
    createNew,
    remove,
    updateSession,
    refresh,
    loading,
    captureSessionLabel,
  };
}
