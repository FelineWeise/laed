"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AssistantPanel } from "@/components/AssistantPanel";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { ChatBubble } from "@/components/ChatBubble";
import { MentionAutocomplete } from "@/components/MentionAutocomplete";
import { MentionHighlightedText } from "@/components/MentionHighlightedText";
import { CollaboratorsPanel } from "@/components/CollaboratorsPanel";
import { Mic } from "@/components/icons";
import { apiFetch, apiUpload } from "@/lib/api";
import { useProjectChat } from "@/lib/hooks/useProjectChat";
import { useThreadSessions } from "@/lib/hooks/useThreadSessions";
import {
  ConversationDrawer,
  drawerTimeFromIso,
} from "@/components/chat/ConversationDrawer";
import { ContextPicker } from "@/components/ContextPicker";
import { LlmModelSelect } from "@/components/LlmModelSelect";
import { useLlmModels } from "@/lib/hooks/useLlmModels";
import { useIsNarrowViewport } from "@/lib/hooks/useMediaQuery";
import { resolveMentionedUserIds } from "@/lib/mentionUtils";
import { PrivateBadge } from "@/components/PrivateBadge";
import type {
  CaptureSession,
  ExplicitContextItem,
  InsightsResponse,
  Member,
  ProjectFile,
  TopologyGraph,
} from "@/lib/types";

type Tab = "thread" | "context" | "insights" | "people";

function RoomInner() {
  const params = useParams();
  const projectId = params.id as string;
  const search = useSearchParams();
  const router = useRouter();
  const tab = (search.get("tab") as Tab) || "thread";
  const topicId = search.get("topicId");
  const deepThreadId = search.get("threadSessionId");

  const isNarrow = useIsNarrowViewport();
  const [historyOpen, setHistoryOpen] = useState(!isNarrow);
  const {
    sessions,
    selectedId: sessionId,
    setSelectedId: setSessionId,
    selectedSession,
    createNew: createThreadSession,
    remove: removeThreadSession,
    loading: sessionsLoading,
    sessionLabel: labelSession,
    setAiEnabled,
  } = useThreadSessions(projectId, topicId, tab === "thread");
  const laedEnabled = selectedSession?.ai_enabled ?? false;
  const { selectedId: llmModelId } = useLlmModels();
  const {
    messages,
    connected,
    connectionError,
    sending,
    send,
    streamText,
    streamingAi,
    streamError,
  } = useProjectChat(projectId, topicId, sessionId, laedEnabled);
  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [topicLabel, setTopicLabel] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState("Project");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [captureSessions, setCaptureSessions] = useState<CaptureSession[]>([]);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [threadContext, setThreadContext] = useState<ExplicitContextItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void apiFetch<{ id: string }>("/api/auth/me").then((u) => setMyUserId(u.id));
  }, []);

  useEffect(() => {
    if (tab !== "thread") return;
    void apiFetch<Member[]>(`/api/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [projectId, tab]);

  useEffect(() => {
    if (!deepThreadId || sessions.length === 0) return;
    if (sessions.some((s) => s.id === deepThreadId)) {
      setSessionId(deepThreadId);
    }
  }, [deepThreadId, sessions, setSessionId]);

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

  const loadCaptureSessions = useCallback(async () => {
    const params = new URLSearchParams({ project_id: projectId });
    if (topicId) params.set("topic_node_id", topicId);
    const data = await apiFetch<CaptureSession[]>(
      `/api/capture/sessions?${params.toString()}`,
    );
    setCaptureSessions(data);
  }, [projectId, topicId]);

  useEffect(() => {
    if (tab === "context") {
      void loadFiles();
      void loadCaptureSessions();
    }
    if (tab === "insights") void loadInsights();
  }, [tab, loadFiles, loadCaptureSessions, loadInsights]);

  useEffect(() => {
    setHistoryOpen(!isNarrow);
  }, [isNarrow]);

  async function handleUpload(fileList: FileList | null) {
    if (fileList === null || fileList.length === 0) return;
    const file = fileList[0];
    if (file === undefined) return;
    setUploading(true);
    try {
      const folders = await apiFetch<{ id: string; path: string }[]>(
        `/api/projects/${projectId}/folders`,
      );
      const uploads =
        folders.find((f) => f.path === "/Uploads") ?? folders[0];
      if (uploads === undefined) {
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder_id", uploads.id);
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
        className={`laed-nav flex-1 py-2 text-center ${tab === t ? "laed-nav--active" : "laed-nav--inactive"}`}
        style={{
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
        <div className="laed-room-root">
        <header className="shrink-0 border-b border-[var(--laed-border)] px-4 py-2">
          <div className="text-center">
            <div className="text-[11px] font-bold tracking-[2px] text-[var(--laed-ink)] uppercase">
              {topicLabel ?? projectLabel}
            </div>
            <div className="mt-0.5 text-[9px] tracking-[1px] text-[var(--laed-muted)]">
              {topicLabel ? projectLabel : "All topics"}
            </div>
          </div>
          <div
            className={`mt-1 text-right text-[9px] tracking-[1px] uppercase ${
              connected
                ? "text-[var(--laed-green)]"
                : connectionError
                  ? "text-[var(--laed-accent)]"
                  : "text-[var(--laed-muted)]"
            }`}
          >
            {connected
              ? "Active"
              : connectionError ?? "Connecting…"}
          </div>
        </header>
        <nav className="flex shrink-0 overflow-x-auto border-b border-[var(--laed-border)]">
          {tabLink("thread", "Thread")}
          {tabLink("context", "Context")}
          {tabLink("insights", "Insights")}
          {tabLink("people", "People")}
        </nav>

        <div className="laed-room-body">
        {tab === "thread" ? (
          <section className="laed-room-chat-row flex min-h-0 flex-1 overflow-hidden">
            <ConversationDrawer
              open={historyOpen}
              onToggle={() => setHistoryOpen((o) => !o)}
              items={sessions.map((s) => ({
                id: s.id,
                title: labelSession(s),
                timeLabel: drawerTimeFromIso(s.created_at),
              }))}
              selectedId={sessionId}
              onSelect={setSessionId}
              onNewChat={() => void createThreadSession()}
              onDelete={(id) => void removeThreadSession(id)}
              loading={sessionsLoading}
            />
            <div className="laed-room-chat-column flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
              {messages.length === 0 && !streamingAi ? (
                <p className="text-center text-[10px] text-[var(--laed-muted)]">
                  {sending
                    ? "Sending…"
                    : "No messages yet. Turn on LAED to include the assistant."}
                </p>
              ) : null}
              {streamingAi && streamText ? (
                <ChatBubble kind="ai" sender="LAED" time="" markdown>
                  {streamText}
                </ChatBubble>
              ) : null}
              {streamError ? (
                <p className="text-center text-[10px] text-[var(--laed-accent)]">
                  {streamError}
                </p>
              ) : null}
              {messages.map((m) => {
                const isAi = m.message_type === "ai";
                const isMe =
                  !isAi &&
                  !m.is_anonymous &&
                  m.user_id !== null &&
                  myUserId !== null &&
                  m.user_id === myUserId;
                const isAnon = !isAi && m.is_anonymous;
                const replyPreview = m.reply_preview ?? null;
                return (
                  <ChatBubble
                    key={m.id}
                    kind={isAi ? "ai" : isMe ? "me" : isAnon ? "anonymous" : "them"}
                    userId={m.user_id}
                    sender={
                      isAi
                        ? "AI"
                        : isAnon
                          ? "Anonymous"
                          : (m.sender_label ?? undefined)
                    }
                    time={m.created_at.slice(11, 16)}
                    markdown={isAi}
                    replyPreview={
                      replyPreview
                        ? {
                            content: replyPreview.content,
                            sender_label: replyPreview.sender_label,
                          }
                        : null
                    }
                    onReply={
                      !isAi
                        ? () => {
                            setReplyToMessageId(m.id);
                            composerRef.current?.focus();
                          }
                        : undefined
                    }
                  >
                    {isAi ? (
                      m.content
                    ) : (
                      <MentionHighlightedText
                        content={m.content}
                        mentions={m.mentions}
                      />
                    )}
                  </ChatBubble>
                );
              })}
            </div>
            <div className="border-t border-[var(--laed-border)] bg-[var(--laed-paper-elevated)] p-3">
              <ContextPicker
                projectId={projectId}
                topicNodeId={topicId}
                items={threadContext}
                onChange={setThreadContext}
              />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <LlmModelSelect className="max-w-[200px] shrink-0 border border-[var(--laed-border)] bg-white px-2 py-1 text-[9px]" />
                <label
                  className="flex items-center gap-2 text-[8px] tracking-[1px] text-[var(--laed-muted)] uppercase"
                  title="Include LAED in this thread"
                >
                  <input
                    type="checkbox"
                    checked={laedEnabled}
                    disabled={sessionId === ""}
                    onChange={(e) => {
                      if (sessionId === "") return;
                      void setAiEnabled(sessionId, e.target.checked);
                    }}
                  />
                  LAED
                </label>
                <label className="flex items-center gap-2 text-[8px] tracking-[1px] text-[var(--laed-muted)] uppercase">
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => setAnonymous(e.target.checked)}
                  />
                  Anonymous
                </label>
              </div>
              {replyToMessageId ? (
                <div className="mb-2 flex items-center justify-between gap-2 text-[9px] text-[var(--laed-muted)]">
                  <span>
                    Replying to{" "}
                    {messages.find((m) => m.id === replyToMessageId)?.sender_label ??
                      "message"}
                  </span>
                  <button
                    type="button"
                    className="border-none bg-transparent p-0 text-[8px] tracking-[1px] uppercase hover:text-[var(--laed-ink)]"
                    onClick={() => setReplyToMessageId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <form
                className="relative flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = draft.trim();
                  if (text) {
                    const mentionedIds = resolveMentionedUserIds(text, members);
                    void send(
                      text,
                      anonymous,
                      threadContext,
                      llmModelId,
                      replyToMessageId,
                      mentionedIds,
                    ).catch(() => undefined);
                    setDraft("");
                    setThreadContext([]);
                    setReplyToMessageId(null);
                  }
                }}
              >
                <MentionAutocomplete
                  members={members}
                  draft={draft}
                  onInsert={(next, cursorAfter) => {
                    setDraft(next);
                    requestAnimationFrame(() => {
                      const el = composerRef.current;
                      if (!el) return;
                      el.focus();
                      el.setSelectionRange(cursorAfter, cursorAfter);
                    });
                  }}
                />
                <button
                  type="button"
                  onClick={() => router.push(`/spoken?projectId=${projectId}`)}
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[var(--laed-border)] text-[var(--laed-muted)]"
                  aria-label="Record"
                >
                  <Mic size={12} />
                </button>
                <input
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message… (@ to mention)"
                  className="laed-input-pill flex-1"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="laed-btn-primary shrink-0"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </form>
            </div>
            </div>
          </section>
        ) : null}

        {tab === "context" ? (
          <section className="laed-tab-scroll p-4">
            <p className="laed-label mb-3">Context</p>
            <input
              type="file"
              disabled={uploading}
              onChange={(e) => void handleUpload(e.target.files)}
              className="mb-4 text-[10px]"
            />
            <p className="laed-label mb-2">Files</p>
            <ul className="mb-6">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--laed-border)] py-2 text-[11px]"
                  style={
                    f.is_private
                      ? {
                          background: "var(--laed-private-bg)",
                          borderColor: "var(--laed-private-border)",
                        }
                      : undefined
                  }
                >
                  <span className="flex items-center gap-2">
                    {f.filename}
                    <PrivateBadge isPrivate={f.is_private ?? false} />
                  </span>
                  <label className="flex items-center gap-1 text-[8px] text-[var(--laed-muted)]">
                    <input
                      type="checkbox"
                      checked={f.is_private ?? false}
                      onChange={(e) => {
                        void apiFetch(`/api/projects/${projectId}/files/${f.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ is_private: e.target.checked }),
                        }).then(() => loadFiles());
                      }}
                    />
                    Private
                  </label>
                </li>
              ))}
            </ul>
            <p className="laed-label mb-2">Capture sessions</p>
            <ul>
              {captureSessions.map((s) => (
                <li
                  key={s.id}
                  className="border-b border-[var(--laed-border)] py-2 text-[11px]"
                  style={
                    s.is_private
                      ? { background: "var(--laed-private-bg)" }
                      : undefined
                  }
                >
                  <span className="font-medium">
                    {s.kind === "spoken" ? "Spoken" : "Camera"}: {s.title}
                  </span>
                  <PrivateBadge isPrivate={s.is_private} />
                  {s.transcript ? (
                    <p className="mt-1 line-clamp-2 text-[var(--laed-muted)]">
                      {s.transcript}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "people" ? (
          <CollaboratorsPanel projectId={projectId} topicNodeId={topicId} />
        ) : null}

        {tab === "insights" && insights !== null ? (
          <section className="laed-tab-scroll space-y-6 p-4 text-[11px]">
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
        </div>
        </div>

        <AssistantPanel
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          context="project"
          projectId={projectId}
          topicNodeId={topicId}
        />
        <BottomBar
          projectId={projectId}
          assistantOpen={assistantOpen}
          onAssistantToggle={() => setAssistantOpen((o) => !o)}
        />
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
