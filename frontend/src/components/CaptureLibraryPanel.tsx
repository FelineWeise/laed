"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CaptureAssetOpenButton } from "@/components/CaptureAssetOpenButton";
import { ShareToProjectButton } from "@/components/ShareToProjectButton";
import { captureSessionLabel } from "@/lib/hooks/useCaptureSessions";
import type { CaptureAsset, CaptureSession } from "@/lib/types";

export type CaptureModeFolder = "photo" | "scan" | "video" | "audio";

const FOLDERS: { id: CaptureModeFolder; label: string }[] = [
  { id: "photo", label: "Photo" },
  { id: "scan", label: "Scan" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
];

function sessionMode(session: CaptureSession): CaptureModeFolder {
  const raw = session.metadata?.capture_mode;
  if (raw === "photo" || raw === "scan" || raw === "video" || raw === "audio") {
    return raw;
  }
  return session.kind === "spoken" ? "audio" : "photo";
}

type Props = {
  sessions: CaptureSession[];
  selectedId: string;
  activeMode: CaptureModeFolder;
  onSelectSession: (id: string) => void;
  onNewCapture: () => void;
  loading?: boolean;
};

export function CaptureLibraryPanel({
  sessions,
  selectedId,
  activeMode,
  onSelectSession,
  onNewCapture,
  loading = false,
}: Props) {
  const [assetsBySession, setAssetsBySession] = useState<
    Record<string, CaptureAsset[]>
  >({});
  const [openFolders, setOpenFolders] = useState<Record<CaptureModeFolder, boolean>>({
    photo: false,
    scan: false,
    video: false,
    audio: true,
  });
  const [openSessions, setOpenSessions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenFolders((prev) => ({ ...prev, [activeMode]: true }));
  }, [activeMode]);

  useEffect(() => {
    if (selectedId) {
      setOpenSessions((prev) => ({ ...prev, [selectedId]: true }));
    }
  }, [selectedId]);

  const loadAssets = useCallback(async (sessionId: string) => {
    const list = await apiFetch<CaptureAsset[]>(
      `/api/capture/sessions/${sessionId}/assets`,
    );
    setAssetsBySession((prev) => ({ ...prev, [sessionId]: list }));
  }, []);

  useEffect(() => {
    if (selectedId) void loadAssets(selectedId);
  }, [selectedId, loadAssets]);

  const byFolder = useMemo(() => {
    const map: Record<CaptureModeFolder, CaptureSession[]> = {
      photo: [],
      scan: [],
      video: [],
      audio: [],
    };
    for (const s of sessions) {
      map[sessionMode(s)].push(s);
    }
    return map;
  }, [sessions]);

  function toggleFolder(id: CaptureModeFolder) {
    setOpenFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function openSessionFolder(id: string) {
    setOpenSessions((prev) => {
      if (prev[id]) return prev;
      void loadAssets(id);
      return { ...prev, [id]: true };
    });
  }

  function toggleSessionFolder(id: string) {
    setOpenSessions((prev) => {
      const next = !prev[id];
      if (next) void loadAssets(id);
      return { ...prev, [id]: next };
    });
  }

  return (
    <aside
      className="flex w-[min(42vw,11.5rem)] shrink-0 flex-col overflow-hidden border-r border-[var(--laed-border)] bg-white"
      aria-label="Capture library"
    >
      <button
        type="button"
        onClick={onNewCapture}
        className="laed-btn-private mx-2 mt-2.5 mb-1.5 shrink-0 text-[8px]"
      >
        New capture
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {loading ? (
          <p className="px-2 py-2 text-[9px] text-[var(--laed-muted)]">Loading…</p>
        ) : null}
        {FOLDERS.map((folder) => {
          const list = byFolder[folder.id];
          const open = openFolders[folder.id];
          const active = activeMode === folder.id;
          return (
            <div key={folder.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggleFolder(folder.id)}
                className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-1.5 py-1.5 text-left text-[10px] font-semibold"
                style={{
                  background: active ? "var(--laed-private-bg)" : "transparent",
                  color: active ? "var(--laed-private-accent)" : "var(--laed-ink)",
                }}
              >
                <span className="w-2.5 text-[9px] text-[var(--laed-muted)]">
                  {open ? "▾" : "▸"}
                </span>
                {folder.label}
                <span
                  className="ml-auto rounded-full px-1.5 text-[8px]"
                  style={{
                    background: active
                      ? "var(--laed-private-accent)"
                      : "rgba(26,25,23,0.08)",
                    color: active ? "#fff" : "var(--laed-muted)",
                  }}
                >
                  {list.length}
                </span>
              </button>
              {open ? (
                list.length === 0 ? (
                  <p className="px-2 py-1 text-[9px] text-[var(--laed-muted)]">
                    Empty
                  </p>
                ) : (
                  list.map((session) => {
                    const sessOpen = openSessions[session.id] ?? false;
                    const assets = assetsBySession[session.id] ?? [];
                    const selected = session.id === selectedId;
                    return (
                      <div key={session.id} className="ml-2">
                        <div className="flex items-start gap-0.5">
                          <button
                            type="button"
                            aria-label={sessOpen ? "Collapse files" : "Expand files"}
                            onClick={() => toggleSessionFolder(session.id)}
                            className="mt-1.5 w-3 shrink-0 cursor-pointer border-none bg-transparent p-0 text-[9px] text-[var(--laed-muted)]"
                          >
                            {sessOpen ? "▾" : "▸"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSession(session.id);
                              openSessionFolder(session.id);
                            }}
                            className="flex min-w-0 flex-1 cursor-pointer flex-col rounded-lg border-none px-1.5 py-1.5 text-left"
                            style={{
                              background: selected
                                ? "rgba(26,25,23,0.08)"
                                : "transparent",
                            }}
                          >
                            <span className="block truncate text-[10px] font-medium text-[var(--laed-ink)]">
                              {captureSessionLabel(session)}
                            </span>
                            <span className="text-[8px] text-[var(--laed-muted)]">
                              {new Date(session.created_at).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          </button>
                        </div>
                        {sessOpen ? (
                          <ul className="mb-1 ml-1 flex flex-col gap-0.5">
                            {assets.length === 0 ? (
                              <li className="px-1 py-1 text-[9px] text-[var(--laed-muted)]">
                                No files yet
                              </li>
                            ) : (
                              assets.map((a) => (
                                <li
                                  key={a.id}
                                  className="flex items-center gap-0.5 rounded-md border border-transparent px-1 py-0.5"
                                >
                                  <CaptureAssetOpenButton asset={a} />
                                  <ShareToProjectButton
                                    mode="asset"
                                    assetId={a.id}
                                    linkedProjectId={a.project_id}
                                    onAttached={() => void loadAssets(session.id)}
                                  />
                                </li>
                              ))
                            )}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
