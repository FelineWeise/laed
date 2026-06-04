"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { PrivateBadge } from "@/components/PrivateBadge";
import { ProjectTopicPicker } from "@/components/ProjectTopicPicker";
import {
  ConversationDrawer,
  drawerTimeFromIso,
} from "@/components/chat/ConversationDrawer";
import { useCaptureSessions } from "@/lib/hooks/useCaptureSessions";
import { getStoredToken } from "@/lib/api";

function SpokenInner() {
  const router = useRouter();
  const search = useSearchParams();
  const initialProjectId = search.get("projectId");
  const [historyOpen, setHistoryOpen] = useState(false);
  const {
    sessions,
    selectedId,
    setSelectedId,
    selected,
    createNew,
    remove,
    updateSession,
    loading,
    captureSessionLabel,
    refresh,
  } = useCaptureSessions("spoken", true);

  useEffect(() => {
    if (!initialProjectId || selected?.project_id) return;
    if (selectedId) {
      void updateSession(selectedId, { project_id: initialProjectId });
    }
  }, [initialProjectId, selected?.project_id, selectedId, updateSession]);

  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilityNote, setCapabilityNote] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopStreams = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  const uploadChunk = useCallback(
    async (sessionId: string, blob: Blob) => {
      if (blob.size < 100) return;
      const token = getStoredToken();
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
      const fd = new FormData();
      fd.append("audio", blob, "chunk.webm");
      const res = await fetch(`${base}/api/capture/sessions/${sessionId}/chunks`, {
        method: "POST",
        headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { transcript?: string };
      if (data.transcript) {
        void refresh();
      }
    },
    [refresh],
  );

  async function startRecording() {
    if (!selectedId) {
      const created = await createNew();
      setSelectedId(created.id);
    }
    const sid = selectedId || sessions[0]?.id;
    if (!sid) return;

    setError(null);
    chunksRef.current = [];
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        setCapabilityNote("Capturing tab/system audio where supported.");
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setCapabilityNote("Microphone only — system audio needs desktop Chrome/Edge.");
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      chunkTimerRef.current = setInterval(() => {
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        void uploadChunk(sid, blob);
      }, 4000);
      setRecording(true);
    } catch {
      setError("Could not access microphone or screen audio.");
    }
  }

  async function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
    const sid = selectedId;
    if (sid && chunksRef.current.length > 0) {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];
      await uploadChunk(sid, blob);
    }
    stopStreams();
    if (sid) {
      await updateSession(sid, { status: "completed" });
      await refresh();
    }
  }

  useEffect(() => () => stopStreams(), [stopStreams]);

  const drawerItems = sessions.map((s) => ({
    id: s.id,
    title: captureSessionLabel(s),
    timeLabel: drawerTimeFromIso(s.created_at),
  }));

  return (
    <AuthGuard>
      <AppShell
        breadcrumb={{
          label: "← Spoken",
          onClick: () => router.push("/global"),
        }}
      >
        <div className="laed-room-body flex min-h-0 flex-1 flex-col pb-[var(--laed-bottom-bar-offset)]">
          <div className="laed-room-chat-row flex min-h-0 flex-1">
            <ConversationDrawer
              open={historyOpen}
              onToggle={() => setHistoryOpen((o) => !o)}
              items={drawerItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onNewChat={() => void createNew()}
              onDelete={(id) => void remove(id)}
              loading={loading}
            />
            <div className="laed-room-chat-column flex min-h-0 min-w-0 flex-1 flex-col p-4">
              {selected ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <PrivateBadge isPrivate={selected.is_private} />
                    <label className="flex items-center gap-1.5 text-[9px] text-[var(--laed-muted)]">
                      <input
                        type="checkbox"
                        checked={selected.is_private}
                        onChange={(e) => {
                          void updateSession(selected.id, {
                            is_private: e.target.checked,
                          });
                        }}
                      />
                      Keep private (your space)
                    </label>
                  </div>
                  <ProjectTopicPicker
                    projectId={selected.project_id}
                    topicNodeId={selected.topic_node_id}
                    onProjectChange={(pid) => {
                      void updateSession(selected.id, {
                        project_id: pid,
                        topic_node_id: null,
                      });
                    }}
                    onTopicChange={(tid) => {
                      void updateSession(selected.id, {
                        topic_node_id: tid,
                      });
                    }}
                    className="mb-4"
                  />
                  {capabilityNote ? (
                    <p className="mb-2 text-[9px] text-[var(--laed-muted)]">
                      {capabilityNote}
                    </p>
                  ) : null}
                  <div
                    className="min-h-[200px] flex-1 overflow-y-auto rounded-sm border border-[var(--laed-border)] p-3 text-[11px] leading-relaxed whitespace-pre-wrap"
                    style={
                      selected.is_private
                        ? {
                            borderColor: "var(--laed-private-border)",
                            background: "var(--laed-private-bg)",
                          }
                        : undefined
                    }
                  >
                    {selected.transcript || (
                      <span className="text-[var(--laed-muted)]">
                        Live transcript appears here…
                      </span>
                    )}
                  </div>
                  {error ? (
                    <p className="mt-2 text-[10px] text-red-700">{error}</p>
                  ) : null}
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (recording) void stopRecording();
                        else void startRecording();
                      }}
                      className="flex h-14 w-14 items-center justify-center rounded-full border-none text-white"
                      style={{
                        background: recording
                          ? "var(--laed-private)"
                          : "var(--laed-navy)",
                      }}
                      aria-label={recording ? "Stop" : "Record"}
                    >
                      {recording ? (
                        <span className="block h-4 w-4 bg-white" />
                      ) : (
                        <span className="text-lg">●</span>
                      )}
                    </button>
                  </div>
                  <p className="mt-2 text-center text-[8px] tracking-[1px] text-[var(--laed-muted)] uppercase">
                    {recording ? "Stop" : "Record"}
                  </p>
                </>
              ) : (
                <p className="text-center text-[10px] text-[var(--laed-muted)]">
                  Start a new spoken session.
                </p>
              )}
            </div>
          </div>
        </div>
        <BottomBar />
      </AppShell>
    </AuthGuard>
  );
}

export default function SpokenPage() {
  return (
    <Suspense>
      <SpokenInner />
    </Suspense>
  );
}
