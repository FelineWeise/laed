"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { ChatBubble } from "@/components/ChatBubble";
import { Mic } from "@/components/icons";
import { apiFetch, apiUpload } from "@/lib/api";
import { useProjectChat } from "@/lib/hooks/useProjectChat";
import type { InsightsResponse, ProjectFile, TopologyGraph } from "@/lib/types";

type Tab = "thread" | "files" | "insights";

function RoomInner() {
  const params = useParams();
  const projectId = params.id as string;
  const search = useSearchParams();
  const router = useRouter();
  const tab = (search.get("tab") as Tab) || "thread";
  const topicId = search.get("topicId");

  const { messages, connected, send } = useProjectChat(projectId, topicId);
  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [topicLabel, setTopicLabel] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState("Project");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ id: string }>("/api/auth/me").then((u) => setMyUserId(u.id));
  }, []);

  useEffect(() => {
    void apiFetch<TopologyGraph>(`/api/projects/${projectId}/topology`).then((g) => {
      const center = g.nodes.find((n) => n.node_type === "project");
      if (center) setProjectLabel(center.label);
      if (topicId !== null) {
        const node = g.nodes.find((n) => n.id === topicId);
        setTopicLabel(node?.label ?? "Topic");
      } else {
        setTopicLabel(null);
      }
    });
  }, [projectId, topicId]);

  const loadFiles = useCallback(async () => {
    const paramsQ = topicId !== null ? `?topic_node_id=${topicId}` : "";
    const data = await apiFetch<ProjectFile[]>(
      `/api/projects/${projectId}/files${paramsQ}`,
    );
    setFiles(data);
  }, [projectId, topicId]);

  const loadInsights = useCallback(async () => {
    const data = await apiFetch<InsightsResponse>(
      `/api/projects/${projectId}/insights`,
    );
    setInsights(data);
  }, [projectId]);

  useEffect(() => {
    if (tab === "files") void loadFiles();
    if (tab === "insights") void loadInsights();
  }, [tab, loadFiles, loadInsights]);

  async function handleUpload(fileList: FileList | null) {
    if (fileList === null || fileList.length === 0) return;
    const file = fileList[0];
    if (file === undefined) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (topicId !== null) fd.append("topic_node_id", topicId);
      await apiUpload(`/api/projects/${projectId}/files`, fd);
      await loadFiles();
    } finally {
      setUploading(false);
    }
  }

  const tabLink = (t: Tab, label: string) => {
    const q = topicId ? `&topicId=${topicId}` : "";
    return (
      <Link
        href={`/projects/${projectId}/room?tab=${t}${q}`}
        className="flex-1 py-2 text-center text-[8px] tracking-[1.5px] uppercase"
        style={{
          color: tab === t ? "var(--laed-ink)" : "var(--laed-muted)",
          borderBottom:
            tab === t
              ? "1.5px solid var(--laed-ink)"
              : "1.5px solid transparent",
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <AuthGuard>
      <AppShell
        breadcrumb={{
          label: `← ${projectLabel.toUpperCase()}`,
          onClick: () => router.push(`/projects/${projectId}/canvas`),
        }}
      >
        <header className="shrink-0 border-b border-[var(--laed-border)] px-4 py-2">
          <div className="text-center">
            <div className="text-[11px] font-bold tracking-[2px] text-[var(--laed-ink)] uppercase">
              {topicLabel ?? projectLabel}
            </div>
            <div className="mt-0.5 text-[9px] tracking-[1px] text-[var(--laed-muted)]">
              {topicLabel ? projectLabel : "All topics"}
            </div>
          </div>
          <div className="mt-1 text-right text-[9px] tracking-[1px] text-[var(--laed-green)] uppercase">
            {connected ? "Active" : "Connecting…"}
          </div>
        </header>
        <nav className="flex shrink-0 border-b border-[var(--laed-border)]">
          {tabLink("thread", "Thread")}
          {tabLink("files", "Files")}
          {tabLink("insights", "Insights")}
        </nav>

        {tab === "thread" ? (
          <section className="flex min-h-0 flex-1 flex-col pb-24">
            <div className="flex-1 overflow-y-auto p-3.5">
              {messages.map((m) => {
                const isMe =
                  !m.is_anonymous &&
                  m.user_id !== null &&
                  myUserId !== null &&
                  m.user_id === myUserId;
                return (
                  <ChatBubble
                    key={m.id}
                    kind={isMe ? "me" : "them"}
                    sender={
                      m.is_anonymous ? "Anonymous" : (m.sender_label ?? undefined)
                    }
                    time={m.created_at.slice(11, 16)}
                  >
                    {m.content}
                  </ChatBubble>
                );
              })}
            </div>
            <div className="border-t border-[var(--laed-border)] bg-[var(--laed-paper-elevated)] p-3">
              <label className="mb-2 flex items-center gap-2 text-[8px] tracking-[1px] text-[var(--laed-muted)] uppercase">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                Anonymous
              </label>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) {
                    send(draft.trim(), anonymous);
                    setDraft("");
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => router.push(`/record?projectId=${projectId}`)}
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[var(--laed-border)] text-[var(--laed-muted)]"
                  aria-label="Record"
                >
                  <Mic size={12} />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message…"
                  className="laed-input flex-1"
                />
                <button type="submit" className="laed-btn-primary shrink-0">
                  Send
                </button>
              </form>
            </div>
          </section>
        ) : null}

        {tab === "files" ? (
          <section className="flex-1 overflow-y-auto p-4 pb-24">
            <p className="laed-label mb-3">Documents</p>
            <input
              type="file"
              disabled={uploading}
              onChange={(e) => void handleUpload(e.target.files)}
              className="mb-4 text-[10px]"
            />
            <ul>
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between border-b border-[var(--laed-border)] py-2 text-[11px]"
                >
                  <span>{f.filename}</span>
                  <span className="laed-label">{f.ingestion_status}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "insights" && insights !== null ? (
          <section className="flex-1 space-y-6 overflow-y-auto p-4 pb-24 text-[11px]">
            <div>
              <p className="laed-label mb-2 text-[var(--laed-navy)]">From AI</p>
              <ul className="list-disc pl-4 text-[var(--laed-muted)]">
                {insights.ai_highlights.map((b) => (
                  <li key={b.id}>{b.text}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="laed-label mb-2 text-[var(--laed-navy)]">
                Recent documents
              </p>
              <ul className="text-[var(--laed-muted)]">
                {insights.recent_documents.map((d) => (
                  <li key={d.id}>{d.filename}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <BottomBar projectId={projectId} />
      </AppShell>
    </AuthGuard>
  );
}

export default function RoomPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center laed-label">Loading…</div>}>
      <RoomInner />
    </Suspense>
  );
}
