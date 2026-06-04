"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { apiUpload } from "@/lib/api";

function CameraInner() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  } = useCaptureSessions("camera", true);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    let sid = selectedId;
    if (!sid) {
      const created = await createNew();
      sid = created.id;
    }
    const session = sessions.find((s) => s.id === sid) ?? selected;
    if (!session?.project_id) {
      setError("Allocate this session to a project before adding images.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("image", file);
        await apiUpload(`/api/capture/sessions/${sid}/assets`, fd);
      }
      await refresh();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const drawerItems = sessions.map((s) => ({
    id: s.id,
    title: captureSessionLabel(s),
    timeLabel: drawerTimeFromIso(s.created_at),
  }));

  const assetCount =
    typeof selected?.metadata?.asset_count === "number"
      ? selected.metadata.asset_count
      : 0;

  return (
    <AuthGuard>
      <AppShell
        breadcrumb={{
          label: "← Camera",
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
                  <p className="mb-3 text-[10px] text-[var(--laed-muted)]">
                    {assetCount} image{assetCount === 1 ? "" : "s"} in this session.
                    Add photos or screenshots below.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="w-full border border-[var(--laed-border)] py-8 text-[10px] tracking-[1px] uppercase"
                    style={{ borderRadius: "var(--laed-radius-sm)" }}
                  >
                    {uploading ? "Uploading…" : "Add image or screenshot"}
                  </button>
                  {error ? (
                    <p className="mt-2 text-[10px] text-red-700">{error}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-center text-[10px] text-[var(--laed-muted)]">
                  Start a new camera session.
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

export default function CameraPage() {
  return (
    <Suspense>
      <CameraInner />
    </Suspense>
  );
}
