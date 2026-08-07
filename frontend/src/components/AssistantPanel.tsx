"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAiStream, type RetrievalScopePayload } from "@/lib/hooks/useAiStream";
import {
  conversationLabel,
  useAiConversations,
} from "@/lib/hooks/useAiConversations";
import {
  useAssistantFloatingPanel,
  type ResizeEdge,
} from "@/lib/hooks/useAssistantFloatingPanel";
import { LlmModelSelect } from "@/components/LlmModelSelect";
import { useLlmModels } from "@/lib/hooks/useLlmModels";
import { useThirdpartyEmbedding } from "@/lib/hooks/useThirdpartyEmbedding";
import { ThirdpartyEmbeddingPrompt } from "@/components/ThirdpartyEmbeddingPrompt";
import { useIsNarrowViewport } from "@/lib/hooks/useMediaQuery";
import { ContextPicker } from "@/components/ContextPicker";
import { MessageSources } from "@/components/MessageSources";
import { ChatBubble } from "@/components/ChatBubble";
import { EditableSessionTitle } from "@/components/chat/EditableSessionTitle";
import { MicButton } from "@/components/MicButton";
import { ShareToProjectButton } from "@/components/ShareToProjectButton";
import { ExpandIcon, SendArrow } from "@/components/icons";
import {
  ConversationDrawer,
  drawerTimeFromIso,
} from "@/components/chat/ConversationDrawer";
import { useDictation } from "@/lib/hooks/useDictation";
import type { AiMessage, ExplicitContextItem } from "@/lib/types";

export type AssistantContext = "workspace" | "project";

type Props = {
  open: boolean;
  onClose: () => void;
  context: AssistantContext;
  variant?: "floating" | "page";
  projectId?: string;
  topicNodeId?: string | null;
  /** When opened from a project room thread, link new/deleted LAED chats to that thread. */
  linkedThreadSessionId?: string | null;
  onThreadSessionMutated?: () => void;
};

export function AssistantPanel({
  open,
  onClose,
  context,
  variant = "floating",
  projectId,
  topicNodeId = null,
  linkedThreadSessionId = null,
  onThreadSessionMutated,
}: Props) {
  const router = useRouter();
  const isPage = variant === "page";
  const [activeProjectId, setActiveProjectId] = useState(projectId ?? "");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const dictation = useDictation(setDraft);
  const [streamText, setStreamText] = useState("");
  const [explicitContext, setExplicitContext] = useState<ExplicitContextItem[]>([]);
  const isNarrow = useIsNarrowViewport();
  const [historyOpen, setHistoryOpen] = useState(!isNarrow);
  const { streamMessage, streaming, error } = useAiStream();
  const { selectedId } = useLlmModels();
  const {
    models: embeddingModels,
    selectedId: selectedEmbeddingId,
    selectModel: selectEmbeddingModel,
    loading: embeddingModelsLoading,
  } = useThirdpartyEmbedding();
  const [embeddingPromptOpen, setEmbeddingPromptOpen] = useState(false);
  const [embeddingPromptReason, setEmbeddingPromptReason] = useState<string | null>(
    null,
  );
  const pendingSendRef = useRef<{
    userText: string;
    retrievalScope: RetrievalScopePayload | null;
  } | null>(null);

  const floating = useAssistantFloatingPanel(open && !isPage);

  const isWorkspace = context === "workspace";
  const {
    conversations,
    selectedId: conversationId,
    setSelectedId: setConversationId,
    selected: selectedConversation,
    createNew,
    remove: removeConversation,
    updateConversation,
    loading: convsLoading,
  } = useAiConversations({
    projectId: isWorkspace ? undefined : activeProjectId || undefined,
    enabled: open && (isWorkspace || activeProjectId !== ""),
    linkedThreadSessionId: isWorkspace ? null : linkedThreadSessionId,
    topicNodeId: isWorkspace ? null : topicNodeId,
  });

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

  async function runStream(
    userText: string,
    retrievalScope: RetrievalScopePayload | null,
    embeddingModel: string | null,
  ) {
    const outcome = await streamMessage(
      {
        projectId: isWorkspace ? undefined : activeProjectId,
        conversationId,
        content: userText,
        topicNodeId,
        model: selectedId || null,
        embeddingModel,
        retrievalScope,
        explicitContext,
      },
      (token) => setStreamText((s) => s + token),
    );

    const msgPath = isWorkspace
      ? `/api/ai/conversations/${conversationId}/messages`
      : `/api/projects/${activeProjectId}/ai/conversations/${conversationId}/messages`;

    if (outcome.status === "ok") {
      const result = outcome.result;
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
      return;
    }

    setStreamText("");
    if (outcome.status === "oss_embedding_unavailable") {
      pendingSendRef.current = { userText, retrievalScope };
      setEmbeddingPromptReason(outcome.message);
      setEmbeddingPromptOpen(true);
      return;
    }

    void apiFetch<AiMessage[]>(msgPath).then(setMessages);
  }

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

    await runStream(userText, retrievalScope, null);
  }

  function confirmEmbeddingFallback() {
    const pending = pendingSendRef.current;
    if (!pending || !selectedEmbeddingId) return;
    setEmbeddingPromptOpen(false);
    pendingSendRef.current = null;
    void runStream(pending.userText, pending.retrievalScope, selectedEmbeddingId);
  }

  if (!open && !isPage) return null;

  const isPrivateSpace = true;
  const heightLabel =
    floating.heightMode === "full"
      ? "Full height"
      : floating.heightMode === "mid"
        ? "Mid height"
        : "Collapsed";

  const chatBody = (
    <>
      {!isWorkspace && activeProjectId === "" ? (
        <p className="px-4 py-3 text-[10px] text-[var(--laed-muted)]">
          Create a project to use project-scoped chat.
        </p>
      ) : isWorkspace || activeProjectId !== "" ? (
        <div className="flex min-h-0 flex-1 gap-1 overflow-hidden px-1">
          <ConversationDrawer
            open={historyOpen}
            onToggle={() => setHistoryOpen((o) => !o)}
            items={drawerItems}
            selectedId={conversationId}
            onSelect={setConversationId}
            onNewChat={() => void createNew().then(() => setMessages([]))}
            onDelete={(id) => {
              void removeConversation(id).then(() => {
                setMessages([]);
                onThreadSessionMutated?.();
              });
            }}
            onRename={(id, title) => void updateConversation(id, { title })}
            loading={convsLoading}
            newButtonLabel="New chat"
            accent="private"
            soft
            deleteConfirmMessage={
              linkedThreadSessionId
                ? "Remove this chat from your LAED history? The linked project thread and its messages will be deleted too."
                : "Remove this chat from your LAED history?"
            }
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {isPage && conversationId !== "" ? (
              <div className="shrink-0 px-4 pb-2">
                {isWorkspace && selectedConversation?.project_id == null ? (
                  <p className="mb-1 text-[9px] tracking-[0.6px] text-[var(--laed-private-accent)] uppercase">
                    Private workspace
                  </p>
                ) : null}
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <EditableSessionTitle
                      value={
                        selectedConversation
                          ? conversationLabel(selectedConversation)
                          : "your LAED"
                      }
                      onSave={(title) => {
                        if (conversationId) {
                          void updateConversation(conversationId, { title });
                        }
                      }}
                      heading
                    />
                  </div>
                  {isWorkspace ? (
                    <ShareToProjectButton
                      mode="conversation"
                      conversationId={conversationId}
                      linkedProjectId={selectedConversation?.project_id}
                      onAttached={(pid) => {
                        void updateConversation(conversationId, {
                          project_id: pid,
                          is_private: true,
                        });
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="laed-assistant-messages">
              {messages.map((m) =>
                m.role === "user" ? (
                  <ChatBubble key={m.id} kind="me" privateSpace={isPrivateSpace}>
                    {m.content}
                  </ChatBubble>
                ) : (
                  <div key={m.id} className="mb-3">
                    <ChatBubble kind="ai" markdown privateSpace={isPrivateSpace}>
                      {m.content}
                    </ChatBubble>
                    <MessageSources chunks={m.source_chunks} />
                  </div>
                ),
              )}
              {streamText ? (
                <ChatBubble kind="ai" markdown privateSpace={isPrivateSpace}>
                  {streamText}
                </ChatBubble>
              ) : null}
            </div>
            {error !== null ? (
              <p className="shrink-0 px-4 text-[10px] text-red-700">{error}</p>
            ) : null}
            <div className="laed-assistant-footer">
              <ContextPicker
                projectId={isWorkspace ? undefined : activeProjectId}
                topicNodeId={topicNodeId}
                items={explicitContext}
                onChange={setExplicitContext}
              />
              <div className="flex flex-wrap items-center gap-2">
                <LlmModelSelect className="max-w-[140px] shrink-0 border border-[var(--laed-border)] bg-[var(--laed-paper-elevated)] px-2 py-1.5 text-[9px]" />
                <MicButton
                  listening={dictation.listening}
                  onClick={() => dictation.toggle(draft)}
                  size={38}
                  accent={isWorkspace ? "private" : "project"}
                />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={streaming}
                  placeholder={
                    dictation.listening
                      ? "Listening…"
                      : isWorkspace
                        ? "Ask or dictate…"
                        : "Ask or dictate about project docs…"
                  }
                  className="laed-input-pill min-w-0 flex-1 laed-input-pill--private"
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
                  className="laed-btn-private flex h-10 w-10 shrink-0 items-center justify-center !rounded-full !p-0"
                  aria-label="Send"
                >
                  <SendArrow size={16} />
                </button>
              </div>
              {dictation.error ? (
                <p className="mt-1 text-[9px] text-red-700">{dictation.error}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  const resizeEdges: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  if (isPage) {
    return (
      <>
        <ThirdpartyEmbeddingPrompt
          open={embeddingPromptOpen}
          reason={embeddingPromptReason}
          models={embeddingModels}
          selectedId={selectedEmbeddingId}
          onSelect={selectEmbeddingModel}
          loading={embeddingModelsLoading}
          onConfirm={() => confirmEmbeddingFallback()}
          onCancel={() => {
            setEmbeddingPromptOpen(false);
            pendingSendRef.current = null;
            setEmbeddingPromptReason(null);
          }}
        />
        <div className="laed-assistant-body flex min-h-0 flex-1 flex-col overflow-hidden">
          {chatBody}
        </div>
      </>
    );
  }

  return (
    <>
    <ThirdpartyEmbeddingPrompt
      open={embeddingPromptOpen}
      reason={embeddingPromptReason}
      models={embeddingModels}
      selectedId={selectedEmbeddingId}
      onSelect={selectEmbeddingModel}
      loading={embeddingModelsLoading}
      onConfirm={() => confirmEmbeddingFallback()}
      onCancel={() => {
        setEmbeddingPromptOpen(false);
        pendingSendRef.current = null;
        setEmbeddingPromptReason(null);
      }}
    />
    <div className="laed-assistant-overlay" role="dialog" aria-modal={!floating.isMinimal}>
      {floating.showBackdrop ? (
        <button
          type="button"
          className="laed-assistant-backdrop"
          aria-label="Close assistant"
          onClick={onClose}
        />
      ) : null}
      <div
        className="laed-assistant-floating"
        style={{
          left: floating.pos.x,
          top: floating.pos.y,
          width: floating.panelWidth,
          height: floating.panelHeight,
        }}
      >
        {!floating.isNarrow && !floating.isMinimal
          ? resizeEdges.map((edge) => (
              <div
                key={edge}
                className={`laed-assistant-resize-handle laed-assistant-resize-handle--${edge}`}
                role="separator"
                aria-label={`Resize ${edge}`}
                onPointerDown={floating.startResize(edge)}
              />
            ))
          : null}
        <header
          className={`laed-assistant-header ${floating.isNarrow ? "" : "laed-assistant-header--draggable"}`}
          onPointerDown={floating.isNarrow ? undefined : floating.startMove}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {!floating.isNarrow ? (
              <span className="shrink-0 text-[var(--laed-muted)] select-none" aria-hidden>
                ⠿
              </span>
            ) : null}
            <p className="truncate text-[11px] font-semibold tracking-[1px]">
              your LAED
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/laed")}
              className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-muted)]"
              aria-label="Open full screen"
              title="Full screen"
            >
              <ExpandIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (floating.isMinimal) floating.expandFromMinimal();
                else floating.cycleHeightMode();
              }}
              className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-muted)]"
              aria-label={
                floating.isMinimal ? "Expand chat" : `Height: ${heightLabel}. Click to change.`
              }
              title={heightLabel}
            >
              {floating.isMinimal ? "▢" : floating.heightMode === "full" ? "▬" : "▭"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-muted)]"
            >
              Close
            </button>
          </div>
        </header>

        {!floating.isMinimal ? (
          <div className="laed-assistant-body flex min-h-0 flex-1 flex-col overflow-hidden">
            {chatBody}
          </div>
        ) : null}
      </div>
    </div>
    </>
  );
}
