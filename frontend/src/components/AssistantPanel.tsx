"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAiStream, type RetrievalScopePayload } from "@/lib/hooks/useAiStream";
import {
  conversationLabel,
  useAiConversations,
} from "@/lib/hooks/useAiConversations";
import { useLlmModels } from "@/lib/hooks/useLlmModels";
import { useIsNarrowViewport } from "@/lib/hooks/useMediaQuery";
import { ContextPicker } from "@/components/ContextPicker";
import { MessageSources } from "@/components/MessageSources";
import { ChatBubble } from "@/components/ChatBubble";
import {
  ConversationDrawer,
  drawerTimeFromIso,
} from "@/components/chat/ConversationDrawer";
import type { AiMessage, ExplicitContextItem, Project } from "@/lib/types";

export type AssistantContext = "workspace" | "project";

type Props = {
  open: boolean;
  onClose: () => void;
  context: AssistantContext;
  projectId?: string;
  topicNodeId?: string | null;
};

function ContextChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "" : "opacity-60"}
    >
      <span className="inline-flex items-center gap-1 rounded-[10px] border border-[rgba(26,25,23,0.1)] bg-[rgba(26,25,23,0.05)] px-2.5 py-1 text-[8px] tracking-[1px] text-[var(--laed-muted)] uppercase">
        <span className="text-[var(--laed-navy)]">●</span> {label}
      </span>
    </button>
  );
}

export function AssistantPanel({
  open,
  onClose,
  context,
  projectId,
  topicNodeId = null,
}: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState(projectId ?? "");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [explicitContext, setExplicitContext] = useState<ExplicitContextItem[]>([]);
  const isNarrow = useIsNarrowViewport();
  const [historyOpen, setHistoryOpen] = useState(!isNarrow);
  const { streamMessage, streaming, error } = useAiStream();
  const { models, selectedId, selectModel, loading: modelsLoading } = useLlmModels();

  const isWorkspace = context === "workspace";
  const {
    conversations,
    selectedId: conversationId,
    setSelectedId: setConversationId,
    createNew,
    remove: removeConversation,
    loading: convsLoading,
  } = useAiConversations({
    projectId: isWorkspace ? undefined : activeProjectId || undefined,
    enabled: open && (isWorkspace || activeProjectId !== ""),
  });

  useEffect(() => {
    if (!open) return;
    void apiFetch<Project[]>("/api/projects").then((list) => {
      setProjects(list);
      if (projectId !== undefined) {
        setActiveProjectId(projectId);
        return;
      }
      setActiveProjectId((current) => {
        if (current !== "") return current;
        const first = list[0];
        return first !== undefined ? first.id : "";
      });
    });
  }, [open, projectId]);

  useEffect(() => {
    if (projectId !== undefined) {
      setActiveProjectId(projectId);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || conversationId === "") return;
    if (!isWorkspace && activeProjectId === "") return;
    const msgPath = isWorkspace
      ? `/api/ai/conversations/${conversationId}/messages`
      : `/api/projects/${activeProjectId}/ai/conversations/${conversationId}/messages`;
    void apiFetch<AiMessage[]>(msgPath).then(setMessages);
  }, [open, activeProjectId, conversationId, isWorkspace]);

  useEffect(() => {
    if (!open) {
      setStreamText("");
      setDraft("");
      setExplicitContext([]);
    }
  }, [open]);

  const drawerItems = useMemo(
    () =>
      conversations.map((c) => ({
        id: c.id,
        title: conversationLabel(c),
        timeLabel: drawerTimeFromIso(c.created_at),
      })),
    [conversations],
  );

  async function handleSend() {
    if (!draft.trim() || conversationId === "") return;
    if (!isWorkspace && activeProjectId === "") return;
    const userText = draft.trim();
    setDraft("");
    setStreamText("");
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        conversation_id: conversationId,
        role: "user",
        content: userText,
        source_chunks: null,
        created_at: new Date().toISOString(),
      },
    ]);

    let retrievalScope: RetrievalScopePayload | null = null;
    if (!isWorkspace && activeProjectId !== "") {
      retrievalScope = {
        level: topicNodeId ? "topic" : "project",
        project_ids: [activeProjectId],
        topic_ids: topicNodeId ? [topicNodeId] : [],
        include_linked: false,
        include_constituent_topics: !topicNodeId,
        session_scope_id: conversationId,
      };
    }

    const result = await streamMessage(
      {
        projectId: isWorkspace ? undefined : activeProjectId,
        conversationId,
        content: userText,
        topicNodeId,
        model: selectedId || null,
        retrievalScope,
        explicitContext,
      },
      (token) => setStreamText((s) => s + token),
    );

    const msgPath = isWorkspace
      ? `/api/ai/conversations/${conversationId}/messages`
      : `/api/projects/${activeProjectId}/ai/conversations/${conversationId}/messages`;

    if (result !== null) {
      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId ?? `asst-${Date.now()}`,
          conversation_id: conversationId,
          role: "assistant",
          content: result.content,
          source_chunks: result.sourceChunks,
          created_at: new Date().toISOString(),
        },
      ]);
      setStreamText("");
    } else {
      setStreamText("");
      void apiFetch<AiMessage[]>(msgPath).then(setMessages);
    }
  }

  if (!open) return null;

  const showProjectPicker = context === "workspace" && projects.length > 1;

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 cursor-default border-none bg-black/20"
        aria-label="Close assistant"
        onClick={onClose}
      />
      <div
        className={`laed-shell z-[201] mx-auto flex flex-col border border-[var(--laed-border)] bg-[var(--laed-paper)] shadow-[var(--laed-shadow-pop)] ${
          isNarrow
            ? "absolute right-0 bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 max-h-[min(72vh,560px)]"
            : "absolute top-[48px] right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] w-[min(420px,calc(100vw-2rem))] max-w-[420px]"
        }`}
        style={
          isNarrow
            ? { borderRadius: "var(--laed-radius-sm) var(--laed-radius-sm) 0 0" }
            : { borderRadius: "var(--laed-radius-sm)" }
        }
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--laed-border)] px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[1px] text-[var(--laed-ink)]">
            your LAED
          </p>
          <button
            type="button"
            onClick={onClose}
            className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-muted)]"
          >
            Close
          </button>
        </header>

        {showProjectPicker ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-[var(--laed-border)] px-4 py-2">
            {projects.map((p) => (
              <ContextChip
                key={p.id}
                label={p.name}
                active={activeProjectId === p.id}
                onClick={() => setActiveProjectId(p.id)}
              />
            ))}
          </div>
        ) : null}

        {!isWorkspace && activeProjectId === "" ? (
          <p className="p-4 text-[10px] text-[var(--laed-muted)]">
            Create a project to use project-scoped chat.
          </p>
        ) : isWorkspace || activeProjectId !== "" ? (
          <div className="flex min-h-0 flex-1">
            <ConversationDrawer
              open={historyOpen}
              onToggle={() => setHistoryOpen((o) => !o)}
              items={drawerItems}
              selectedId={conversationId}
              onSelect={setConversationId}
              onNewChat={() => void createNew().then(() => setMessages([]))}
              onDelete={(id) => void removeConversation(id).then(() => setMessages([]))}
              loading={convsLoading}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <ChatBubble key={m.id} kind="me">
                      {m.content}
                    </ChatBubble>
                  ) : (
                    <div key={m.id} className="mb-3">
                      <ChatBubble kind="ai" markdown>
                        {m.content}
                      </ChatBubble>
                      <MessageSources chunks={m.source_chunks} />
                    </div>
                  ),
                )}
                {streamText ? (
                  <ChatBubble kind="ai" markdown>
                    {streamText}
                  </ChatBubble>
                ) : null}
              </div>
              {error !== null ? (
                <p className="shrink-0 px-4 text-[10px] text-red-700">{error}</p>
              ) : null}
              <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--laed-border)] px-4 py-3">
                <ContextPicker
                  projectId={isWorkspace ? undefined : activeProjectId}
                  topicNodeId={topicNodeId}
                  items={explicitContext}
                  onChange={setExplicitContext}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {!modelsLoading && models.length > 0 ? (
                    <select
                      value={selectedId}
                      onChange={(e) => selectModel(e.target.value)}
                      className="max-w-[140px] shrink-0 border border-[var(--laed-border)] bg-white px-2 py-1 text-[9px]"
                      aria-label="LLM model"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id.replace(/^ollama\//, "").replace(/^thirdparty\//, "")}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={streaming}
                    placeholder={
                      isWorkspace ? "Ask anything…" : "Ask about project docs…"
                    }
                    className="laed-input-pill flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={streaming}
                    onClick={() => void handleSend()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-none bg-[var(--laed-navy)] text-white"
                    aria-label="Send"
                  >
                    ●
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
