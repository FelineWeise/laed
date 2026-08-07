"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AssistantPanel } from "@/components/AssistantPanel";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { ChatBubble } from "@/components/ChatBubble";
import { CollaboratorsPanel } from "@/components/CollaboratorsPanel";
import { ContextPicker } from "@/components/ContextPicker";
import { LlmModelSelect } from "@/components/LlmModelSelect";
import { MentionAutocomplete } from "@/components/MentionAutocomplete";
import { MentionHighlightedText } from "@/components/MentionHighlightedText";
import { MicButton } from "@/components/MicButton";
import { Tip } from "@/components/Tip";
import { ThirdpartyEmbeddingPrompt } from "@/components/ThirdpartyEmbeddingPrompt";
import {
  ConversationDrawer,
  drawerTimeFromIso,
} from "@/components/chat/ConversationDrawer";
import {
  Check,
  EyeIcon,
  EyeOffIcon,
  Folder,
  Lock,
  SendArrow,
  Sparkle,
} from "@/components/icons";
import { apiFetch, apiUpload } from "@/lib/api";
import { useDictation } from "@/lib/hooks/useDictation";
import { useLlmModels } from "@/lib/hooks/useLlmModels";
import { useIsNarrowViewport } from "@/lib/hooks/useMediaQuery";
import { useProjectChat } from "@/lib/hooks/useProjectChat";
import { useThreadSessions } from "@/lib/hooks/useThreadSessions";
import { resolveMentionedUserIds } from "@/lib/mentionUtils";
import type {
  ExplicitContextItem,
  InsightsResponse,
  Member,
  Project,
  ProjectFile,
  TopologyGraph,
} from "@/lib/types";

type Tab = "thread" | "agent" | "files" | "members" | "status";

type ProjectFolder = {
  id: string;
  path: string;
  name: string;
};

const STATUS_COL = {
  done: "#2D6A4F",
  pending: "#1D3A57",
  warn: "#B0483A",
  neutral: "#8A8780",
} as const;

const PLACEHOLDER_MILESTONES = [
  "Access agreements signed",
  "Kickoff meeting",
  "Working sessions",
  "Interim review",
  "Draft deliverables shared",
  "Target completion",
] as const;

function normalizeTab(raw: string | null): Tab {
  if (raw === "context") return "files";
  if (raw === "people") return "members";
  if (raw === "insights") return "status";
  if (
    raw === "thread" ||
    raw === "agent" ||
    raw === "files" ||
    raw === "members" ||
    raw === "status"
  ) {
    return raw;
  }
  return "thread";
}

function SoftLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[12px] font-semibold tracking-[0.2px] text-[var(--laed-muted)]">
      {children}
    </div>
  );
}

function AccessDots({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-[10.5px] text-[var(--laed-muted)]">—</span>;
  }
  return (
    <div className="flex items-center gap-1">
      {names.map((n) => {
        const parts = n.trim().split(/\s+/);
        const last = parts[parts.length - 1] ?? "?";
        const initial = (last[0] ?? "?").toUpperCase();
        return (
          <span
            key={n}
            title={n}
            className="flex h-[19px] w-[19px] items-center justify-center rounded-full text-[8.5px] font-bold text-[var(--laed-navy)]"
            style={{ background: "rgba(29,58,87,0.1)" }}
          >
            {initial}
          </span>
        );
      })}
    </div>
  );
}

function StatusKindDot({ kind }: { kind: keyof typeof STATUS_COL }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: STATUS_COL[kind] }}
    />
  );
}

function RoomInner() {
  const params = useParams();
  const projectId = params.id as string;
  const search = useSearchParams();
  const router = useRouter();
  const rawTab = search.get("tab");
  const tab = normalizeTab(rawTab);
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
    refresh: refreshThreadSessions,
  } = useThreadSessions(
    projectId,
    topicId,
    tab === "thread" || tab === "agent",
  );
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
    embeddingFallback,
  } = useProjectChat(
    projectId,
    topicId,
    sessionId,
    laedEnabled,
    llmModelId || null,
  );
  const [draft, setDraft] = useState("");
  const dictation = useDictation(setDraft);
  const [anonymous, setAnonymous] = useState(false);
  const [topicLabel, setTopicLabel] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState("Project");
  const [projectSide, setProjectSide] = useState<"External" | "Internal">(
    "External",
  );
  const [projectStage, setProjectStage] = useState("In progress");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [threadContext, setThreadContext] = useState<ExplicitContextItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [partnerFilter, setPartnerFilter] = useState("All");
  const composerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rawTab === "context" || rawTab === "people" || rawTab === "insights") {
      const q = new URLSearchParams(search.toString());
      q.set("tab", tab);
      router.replace(`/projects/${projectId}/room?${q.toString()}`);
    }
  }, [rawTab, tab, search, projectId, router]);

  useEffect(() => {
    void apiFetch<{ id: string }>("/api/auth/me").then((u) => setMyUserId(u.id));
  }, []);

  useEffect(() => {
    void apiFetch<Member[]>(`/api/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [projectId]);

  useEffect(() => {
    void apiFetch<Project>(`/api/projects/${projectId}`)
      .then((p) => {
        setProjectLabel(p.name);
        setProjectSide(p.ownership_model === "owned" ? "Internal" : "External");
        setProjectStage(p.archived_at ? "Archived" : "In progress");
      })
      .catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    if (!deepThreadId || sessions.length === 0) return;
    if (sessions.some((s) => s.id === deepThreadId)) {
      setSessionId(deepThreadId);
    }
  }, [deepThreadId, sessions, setSessionId]);

  useEffect(() => {
    void apiFetch<TopologyGraph>(`/api/projects/${projectId}/topology`).then(
      (g) => {
        const center = g.nodes.find((n) => n.node_type === "project");
        if (center) setProjectLabel(center.label);
        if (topicId !== null) {
          const node = g.nodes.find((n) => n.id === topicId);
          setTopicLabel(node?.label ?? "Topic");
        } else {
          setTopicLabel(null);
        }
      },
    );
  }, [projectId, topicId]);

  const loadFiles = useCallback(async () => {
    const paramsQ = topicId !== null ? `?topic_node_id=${topicId}` : "";
    const data = await apiFetch<ProjectFile[]>(
      `/api/projects/${projectId}/files${paramsQ}`,
    );
    setFiles(data);
  }, [projectId, topicId]);

  const loadFolders = useCallback(async () => {
    const data = await apiFetch<ProjectFolder[]>(
      `/api/projects/${projectId}/folders`,
    );
    setFolders(data);
  }, [projectId]);

  const loadInsights = useCallback(async () => {
    const data = await apiFetch<InsightsResponse>(
      `/api/projects/${projectId}/insights`,
    );
    setInsights(data);
  }, [projectId]);

  useEffect(() => {
    if (tab === "files" || tab === "status") {
      void loadFiles();
    }
    if (tab === "files") void loadFolders();
    if (tab === "status") void loadInsights();
  }, [tab, loadFiles, loadFolders, loadInsights]);

  useEffect(() => {
    setHistoryOpen(!isNarrow);
  }, [isNarrow]);

  const partnerLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const m of messages) {
      if (m.message_type === "ai") continue;
      const label = m.sender_label?.trim();
      if (label) labels.add(label);
    }
    return Array.from(labels);
  }, [messages]);

  const filteredMessages = useMemo(() => {
    if (partnerFilter === "All") return messages;
    return messages.filter(
      (m) =>
        m.message_type === "ai" ||
        (m.sender_label ?? "") === partnerFilter,
    );
  }, [messages, partnerFilter]);

  const accessNames = useMemo(
    () =>
      members
        .filter((m) => m.role !== "observer")
        .map((m) => m.display_name ?? m.email ?? "Member"),
    [members],
  );

  const milestones = useMemo(() => {
    if (insights !== null && insights.ai_highlights.length > 0) {
      return insights.ai_highlights.map((h) => ({
        name: h.text,
        kind: "pending" as const,
        date: "—",
        note: null as string | null,
      }));
    }
    const hasMessages = messages.length > 0;
    const hasFiles = files.length > 0;
    const agreementsDone = members.some((m) => m.role === "owner");
    return PLACEHOLDER_MILESTONES.map((name, i) => {
      let kind: keyof typeof STATUS_COL = "pending";
      if (name === "Access agreements signed" && agreementsDone) kind = "done";
      if (name === "Kickoff meeting" && hasMessages) kind = "done";
      if (name === "Working sessions" && messages.length >= 5) kind = "done";
      if (name === "Draft deliverables shared" && hasFiles) kind = "done";
      if (i === 3 && hasMessages && !hasFiles) kind = "warn";
      return {
        name,
        kind,
        date: "—",
        note: kind === "warn" ? "Due" : null,
      };
    });
  }, [insights, messages.length, files.length, members]);

  const engagement = useMemo(
    () =>
      members.map((m, i) => ({
        name: m.display_name ?? m.email ?? "Member",
        value: Math.min(0.95, 0.5 + i * 0.08),
      })),
    [members],
  );

  async function handleUpload(fileList: FileList | null) {
    if (fileList === null || fileList.length === 0) return;
    const file = fileList[0];
    if (file === undefined) return;
    setUploading(true);
    try {
      const folderList = await apiFetch<ProjectFolder[]>(
        `/api/projects/${projectId}/folders`,
      );
      const uploads =
        folderList.find((f) => f.path === "/Uploads") ?? folderList[0];
      if (uploads === undefined) return;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder_id", uploads.id);
      if (topicId !== null) fd.append("topic_node_id", topicId);
      await apiUpload(`/api/projects/${projectId}/files`, fd);
      await loadFiles();
      await loadFolders();
    } finally {
      setUploading(false);
    }
  }

  function tabHref(t: Tab) {
    const q = topicId ? `&topicId=${topicId}` : "";
    return `/projects/${projectId}/room?tab=${t}${q}`;
  }

  const tabLink = (t: Tab, label: string) => (
    <Link
      href={tabHref(t)}
      className="flex-1 py-[10px] text-center text-[11px]"
      style={{
        fontWeight: tab === t ? 600 : 500,
        color: tab === t ? "var(--laed-ink)" : "var(--laed-muted)",
        borderBottom: `2px solid ${tab === t ? "var(--laed-ink)" : "transparent"}`,
        marginBottom: -1,
      }}
    >
      {label}
    </Link>
  );

  const partnerCount = members.length;
  const headerName = topicLabel ?? projectLabel;
  const signedAgreements = members.filter((m) => m.role === "owner").length;

  return (
    <AuthGuard>
      <AppShell
        section={projectLabel}
        onHome={() => router.push("/global")}
        chrome="project"
      >
        <div className="laed-room-root">
          <header className="flex shrink-0 items-start justify-between px-[18px] pb-3.5 pt-1.5">
            <div>
              <div className="text-[21px] font-bold tracking-[0.4px] text-[var(--laed-ink)] uppercase">
                {headerName}
              </div>
              <div className="mt-0.5 text-[12.5px] text-[var(--laed-muted)]">
                {projectSide} · {partnerCount}{" "}
                {partnerCount === 1 ? "partner" : "partners"}
              </div>
            </div>
            <span
              className="mt-0.5 rounded-[9px] px-[11px] py-[5px] text-[11.5px] font-medium text-[var(--laed-navy)]"
              style={{ background: "rgba(29,58,87,0.08)" }}
            >
              {projectStage}
            </span>
          </header>

          <nav
            className="flex shrink-0 gap-0.5 px-2.5"
            style={{ borderBottom: "1px solid rgba(26,25,23,0.07)" }}
          >
            {tabLink("thread", "Thread")}
            {tabLink("agent", "Agent")}
            {tabLink("files", "Files")}
            {tabLink("members", "Members")}
            {tabLink("status", "Status")}
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
                  deleteConfirmMessage="Delete this thread and all its messages from the project room? Linked your LAED chats for this thread are removed too."
                />
                <div className="laed-room-chat-column flex min-h-0 min-w-0 flex-1 flex-col">
                  <div
                    className="flex shrink-0 gap-[7px] overflow-x-auto px-3.5 pb-2.5 pt-3"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {["All", ...partnerLabels].map((label) => {
                      const on = partnerFilter === label;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setPartnerFilter(label)}
                          className="shrink-0 border-none px-[13px] py-1.5 text-[11.5px] font-medium"
                          style={{
                            borderRadius: 16,
                            background: on
                              ? "var(--laed-ink)"
                              : "rgba(26,25,23,0.05)",
                            color: on ? "#fff" : "var(--laed-muted)",
                            cursor: "pointer",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3.5 pt-1">
                    {filteredMessages.length === 0 && !streamingAi ? (
                      <p className="text-center text-[10px] text-[var(--laed-muted)]">
                        {sending
                          ? "Sending…"
                          : "No messages yet. Turn on LAED to include the assistant."}
                      </p>
                    ) : null}
                    {streamingAi && streamText ? (
                      <ChatBubble kind="ai" sender="AI" time="" markdown>
                        {streamText}
                      </ChatBubble>
                    ) : null}
                    {streamError ? (
                      <p className="text-center text-[10px] text-[var(--laed-accent)]">
                        {streamError}
                      </p>
                    ) : null}
                    {filteredMessages.map((m) => {
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
                          kind={
                            isAi
                              ? "ai"
                              : isMe
                                ? "me"
                                : isAnon
                                  ? "anonymous"
                                  : "them"
                          }
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
                  <div className="shrink-0 px-4 pb-6 pt-3">
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
                      <span
                        className={`ml-auto text-[9px] tracking-[1px] uppercase ${
                          connected
                            ? "text-[var(--laed-green)]"
                            : connectionError
                              ? "text-[var(--laed-accent)]"
                              : "text-[var(--laed-muted)]"
                        }`}
                      >
                        {connected
                          ? "Active"
                          : (connectionError ?? "Connecting…")}
                      </span>
                    </div>
                    {replyToMessageId ? (
                      <div className="mb-2 flex items-center justify-between gap-2 text-[9px] text-[var(--laed-muted)]">
                        <span>
                          Replying to{" "}
                          {messages.find((m) => m.id === replyToMessageId)
                            ?.sender_label ?? "message"}
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
                    {dictation.error ? (
                      <p className="mb-1 text-[9px] text-[var(--laed-accent)]">
                        {dictation.error}
                      </p>
                    ) : null}
                    <form
                      className="relative flex items-center gap-[9px]"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const text = draft.trim();
                        if (text) {
                          const mentionedIds = resolveMentionedUserIds(
                            text,
                            members,
                          );
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
                      <MicButton
                        listening={dictation.listening}
                        onClick={() => dictation.toggle(draft)}
                      />
                      <input
                        ref={composerRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={
                          dictation.listening
                            ? "Listening…"
                            : "Message or dictate…"
                        }
                        className="laed-input-pill min-w-0 flex-1"
                      />
                      <button
                        type="submit"
                        disabled={sending}
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center border-none bg-[var(--laed-navy)] text-white"
                        style={{ borderRadius: "50%" }}
                        aria-label="Send"
                      >
                        <SendArrow size={16} />
                      </button>
                    </form>
                  </div>
                </div>
              </section>
            ) : null}

            {tab === "agent" ? (
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <AssistantPanel
                  open
                  variant="page"
                  onClose={() => router.push(tabHref("thread"))}
                  context="project"
                  projectId={projectId}
                  topicNodeId={topicId}
                  linkedThreadSessionId={sessionId || null}
                  onThreadSessionMutated={() => void refreshThreadSessions()}
                />
              </section>
            ) : null}

            {tab === "files" ? (
              <section className="laed-tab-scroll px-4 py-3.5">
                <SoftLabel>Access agreements</SoftLabel>
                <div
                  className="mb-5 rounded-2xl bg-white px-3.5 py-1"
                  style={{
                    boxShadow:
                      "0 1px 2px rgba(26,25,23,0.04), 0 6px 16px rgba(26,25,23,0.04)",
                  }}
                >
                  {members.length === 0 ? (
                    <p className="py-3 text-[11px] text-[var(--laed-muted)]">
                      No members yet
                    </p>
                  ) : (
                    members.map((m, i) => {
                      const kind: keyof typeof STATUS_COL =
                        m.role === "owner" ? "done" : "pending";
                      const status = kind === "done" ? "Signed" : "Pending";
                      return (
                        <div
                          key={m.user_id}
                          className="flex items-center justify-between py-[11px]"
                          style={{
                            borderTop:
                              i > 0
                                ? "1px solid rgba(26,25,23,0.06)"
                                : "none",
                          }}
                        >
                          <span className="text-[13px] text-[var(--laed-ink)]">
                            {m.display_name ?? m.email ?? "Member"}
                          </span>
                          <span
                            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium"
                            style={{ color: STATUS_COL[kind] }}
                          >
                            <StatusKindDot kind={kind} />
                            {status}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <SoftLabel>Project files</SoftLabel>
                <input
                  type="file"
                  disabled={uploading}
                  onChange={(e) => void handleUpload(e.target.files)}
                  className="mb-3 text-[10px]"
                />
                <div className="mb-3 flex flex-col gap-[9px]">
                  {folders.map((folder) => {
                    const count = files.filter(
                      (f) => f.folder_id === folder.id,
                    ).length;
                    const folderName =
                      folder.name ||
                      folder.path.replace(/^\//, "") ||
                      "Folder";
                    return (
                      <div
                        key={folder.id}
                        className="flex items-center gap-3 rounded-2xl bg-white px-[15px] py-[13px]"
                        style={{
                          boxShadow:
                            "0 1px 2px rgba(26,25,23,0.04), 0 6px 16px rgba(26,25,23,0.04)",
                        }}
                      >
                        <span className="shrink-0 text-[var(--laed-navy)]">
                          <Folder size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium text-[var(--laed-ink)]">
                            {folderName}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[var(--laed-muted)]">
                            {count} {count === 1 ? "file" : "files"}
                          </div>
                        </div>
                        <AccessDots names={accessNames} />
                      </div>
                    );
                  })}
                </div>

                <ul className="mb-4">
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
                      <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                      <Tip
                        tip={
                          f.is_private
                            ? "Private to you — release to all project members"
                            : "Visible to all project members — click to make private"
                        }
                      >
                        <button
                          type="button"
                          aria-label={
                            f.is_private
                              ? "Release to project members"
                              : "Make private"
                          }
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 text-[var(--laed-muted)] hover:text-[var(--laed-navy)]"
                          onClick={() => {
                            const nextPrivate = !(f.is_private ?? false);
                            void apiFetch(
                              `/api/projects/${projectId}/files/${f.id}`,
                              {
                                method: "PATCH",
                                body: JSON.stringify({
                                  is_private: nextPrivate,
                                  share_with_user_ids: [],
                                }),
                              },
                            ).then(() => loadFiles());
                          }}
                        >
                          {f.is_private ? (
                            <EyeOffIcon size={16} />
                          ) : (
                            <EyeIcon size={16} />
                          )}
                        </button>
                      </Tip>
                    </li>
                  ))}
                </ul>

                <div className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--laed-muted)]">
                  <Lock size={12} /> Access controlled per partner
                </div>
              </section>
            ) : null}

            {tab === "members" ? (
              <CollaboratorsPanel
                projectId={projectId}
                topicNodeId={topicId}
              />
            ) : null}

            {tab === "status" ? (
              <section className="laed-tab-scroll px-4 py-3.5 pb-5">
                <div className="mb-2 flex items-baseline justify-between px-0.5">
                  <span className="text-[10.5px] font-semibold tracking-[0.6px] text-[var(--laed-muted)] uppercase">
                    Milestones
                  </span>
                  <span className="text-[10.5px] font-medium tracking-[0.4px] text-[var(--laed-muted)] tabular-nums">
                    TARGET · —
                  </span>
                </div>
                <div
                  className="mb-[22px] rounded-xl bg-white px-3.5 py-0.5"
                  style={{
                    boxShadow:
                      "0 1px 2px rgba(26,25,23,0.04), 0 6px 16px rgba(26,25,23,0.04)",
                  }}
                >
                  {milestones.map((mi, i) => (
                    <div
                      key={`${mi.name}-${i}`}
                      className="flex items-center gap-[11px] py-[9px]"
                      style={{
                        borderTop:
                          i > 0 ? "1px solid rgba(26,25,23,0.06)" : "none",
                      }}
                    >
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background:
                            mi.kind === "done"
                              ? "var(--laed-green)"
                              : "transparent",
                          border:
                            mi.kind === "done"
                              ? "none"
                              : `1.5px solid ${STATUS_COL[mi.kind]}`,
                        }}
                      >
                        {mi.kind === "done" ? (
                          <Check size={10} color="#fff" />
                        ) : (
                          <span
                            className="h-[5px] w-[5px] rounded-full"
                            style={{ background: STATUS_COL[mi.kind] }}
                          />
                        )}
                      </span>
                      <span
                        className="min-w-0 flex-1 text-[12.5px] text-[var(--laed-ink)]"
                        style={{
                          fontWeight: mi.kind === "warn" ? 600 : 400,
                        }}
                      >
                        {mi.name}
                      </span>
                      <span className="w-[46px] text-right text-[11px] text-[var(--laed-muted)] tabular-nums">
                        {mi.date}
                      </span>
                      <span
                        className="w-[50px] text-right text-[9.5px] font-semibold tracking-[0.3px] uppercase"
                        style={{ color: STATUS_COL[mi.kind] }}
                      >
                        {mi.kind === "done"
                          ? "Done"
                          : mi.note
                            ? mi.note
                            : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mb-2 px-0.5 text-[10.5px] font-semibold tracking-[0.6px] text-[var(--laed-muted)] uppercase">
                  Project metrics
                </div>
                <div
                  className="mb-[22px] grid grid-cols-4 overflow-hidden rounded-xl bg-white"
                  style={{
                    boxShadow:
                      "0 1px 2px rgba(26,25,23,0.04), 0 6px 16px rgba(26,25,23,0.04)",
                  }}
                >
                  {[
                    { v: String(partnerCount), l: "Partners engaged" },
                    { v: String(files.length), l: "Docs shared" },
                    { v: "—", l: "Days to target" },
                    {
                      v: String(signedAgreements),
                      l: "Access agreements",
                    },
                  ].map((m, i) => (
                    <div
                      key={m.l}
                      className="px-2 py-3 text-center"
                      style={{
                        borderLeft:
                          i > 0 ? "1px solid rgba(26,25,23,0.07)" : "none",
                      }}
                    >
                      <div className="text-[21px] font-bold tracking-[-0.5px] text-[var(--laed-ink)] tabular-nums">
                        {m.v}
                      </div>
                      <div className="mt-0.5 text-[8.5px] font-semibold leading-tight tracking-[0.3px] text-[var(--laed-muted)] uppercase">
                        {m.l}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mb-3 text-[9px] text-[var(--laed-muted)]">
                  Days to target and access-agreement counts are placeholders
                  until tracked in the product.
                </p>

                <div className="mb-2 px-0.5 text-[10.5px] font-semibold tracking-[0.6px] text-[var(--laed-muted)] uppercase">
                  Partner engagement
                </div>
                <div
                  className="rounded-xl bg-white px-[15px] pb-[11px] pt-3.5"
                  style={{
                    boxShadow:
                      "0 1px 2px rgba(26,25,23,0.04), 0 6px 16px rgba(26,25,23,0.04)",
                  }}
                >
                  {engagement.length === 0 ? (
                    <p className="text-[11px] text-[var(--laed-muted)]">
                      No partners yet
                    </p>
                  ) : (
                    engagement.map((d) => (
                      <div
                        key={d.name}
                        className="mb-2.5 flex items-center gap-2.5"
                      >
                        <span className="w-[78px] shrink-0 truncate text-[11px] text-[var(--laed-muted)]">
                          {d.name}
                        </span>
                        <div
                          className="h-1.5 flex-1 overflow-hidden rounded-[3px]"
                          style={{ background: "rgba(26,25,23,0.06)" }}
                        >
                          <div
                            className="h-full rounded-[3px]"
                            style={{
                              width: `${d.value * 100}%`,
                              background:
                                d.value >= 0.5
                                  ? "var(--laed-navy)"
                                  : "rgba(29,58,87,0.45)",
                            }}
                          />
                        </div>
                        <span className="w-[30px] text-right text-[11px] font-semibold text-[var(--laed-ink)] tabular-nums">
                          {Math.round(d.value * 100)}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="mt-1 flex items-center gap-1.5 text-[9.5px] text-[var(--laed-muted)]">
                    <Sparkle size={10} /> Auto-generated from project activity
                    <span className="opacity-70">(placeholder scores)</span>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <ThirdpartyEmbeddingPrompt
          open={embeddingFallback.open}
          reason={embeddingFallback.reason}
          models={embeddingFallback.models}
          selectedId={embeddingFallback.selectedId}
          onSelect={embeddingFallback.onSelect}
          loading={embeddingFallback.loading}
          onConfirm={embeddingFallback.onConfirm}
          onCancel={embeddingFallback.onCancel}
        />
        <BottomBar
          projectId={projectId}
          agentActive={tab === "agent"}
          variant="project"
        />
      </AppShell>
    </AuthGuard>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={<div className="laed-label p-8 text-center">Loading…</div>}
    >
      <RoomInner />
    </Suspense>
  );
}
