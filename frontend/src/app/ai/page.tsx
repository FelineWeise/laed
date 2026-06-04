"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { apiFetch } from "@/lib/api";
import { useAiStream } from "@/lib/hooks/useAiStream";
import type { AiMessage, Conversation, Project, SourceChunk } from "@/lib/types";

function ContextChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[10px] border border-[rgba(26,25,23,0.1)] bg-[rgba(26,25,23,0.05)] px-2.5 py-1 text-[8px] tracking-[1px] text-[var(--laed-muted)] uppercase">
      <span className="text-[var(--laed-navy)]">●</span> {label}
    </span>
  );
}

export default function AiPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [lastSources, setLastSources] = useState<SourceChunk[]>([]);
  const { streamMessage, streaming, error } = useAiStream();

  useEffect(() => {
    void apiFetch<Project[]>("/api/projects").then((list) => {
      setProjects(list);
      const first = list[0];
      if (first !== undefined && projectId === "") setProjectId(first.id);
    });
  }, [projectId]);

  useEffect(() => {
    if (projectId === "") return;
    void apiFetch<Conversation[]>(`/api/projects/${projectId}/ai/conversations`).then(
      async (convs) => {
        if (convs.length === 0) {
          const created = await apiFetch<Conversation>(
            `/api/projects/${projectId}/ai/conversations`,
            { method: "POST", body: JSON.stringify({ is_private: true }) },
          );
          setConversationId(created.id);
        } else {
          const first = convs[0];
          if (first !== undefined) setConversationId(first.id);
        }
      },
    );
  }, [projectId]);

  useEffect(() => {
    if (projectId === "" || conversationId === "") return;
    void apiFetch<AiMessage[]>(
      `/api/projects/${projectId}/ai/conversations/${conversationId}/messages`,
    ).then(setMessages);
  }, [projectId, conversationId]);

  async function handleSend() {
    if (!draft.trim() || projectId === "" || conversationId === "") return;
    const userText = draft.trim();
    setDraft("");
    setStreamText("");
    setLastSources([]);
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

    const result = await streamMessage(
      projectId,
      conversationId,
      userText,
      null,
      (token) => setStreamText((s) => s + token),
    );

    if (result !== null) {
      setLastSources(result.sourceChunks);
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
    }
  }

  return (
    <AuthGuard>
      <AppShell
        breadcrumb={{ label: "← AI", onClick: () => router.push("/global") }}
      >
        <div className="flex flex-wrap gap-1.5 px-4 pt-2 pb-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProjectId(p.id)}
              className={
                projectId === p.id ? "" : "opacity-60"
              }
            >
              <ContextChip label={p.name} />
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-28 pt-2">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="mb-3 flex flex-row-reverse">
                <div
                  className="max-w-[80%] px-3.5 py-2.5 text-[11px] leading-snug text-white"
                  style={{
                    background: "var(--laed-ink)",
                    borderRadius: "var(--laed-radius-sm)",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="mb-3 flex">
                <div className="max-w-[88%]">
                  <div className="laed-label mb-1">AI</div>
                  <div
                    className="border border-[var(--laed-border)] bg-white px-3.5 py-2.5 text-[11px] leading-snug"
                    style={{ borderRadius: "var(--laed-radius-sm)" }}
                  >
                    {m.content}
                  </div>
                  {m.source_chunks && m.source_chunks.length > 0 ? (
                    <p className="mt-1 text-[8px] text-[var(--laed-muted)]">
                      Sources:{" "}
                      {m.source_chunks
                        .map((s) => s.filename)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>
            ),
          )}
          {streamText ? (
            <div className="mb-3 flex">
              <div className="max-w-[88%]">
                <div className="laed-label mb-1 flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--laed-navy)]"
                    style={{ animation: "laedpulse 1s infinite" }}
                  />
                  AI · Responding
                </div>
                <div
                  className="border border-[var(--laed-border)] bg-white px-3.5 py-2.5 text-[11px]"
                  style={{ borderRadius: "var(--laed-radius-sm)" }}
                >
                  {streamText}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        {error !== null ? (
          <p className="px-4 text-[10px] text-red-700">{error}</p>
        ) : null}
        <div className="fixed bottom-0 left-1/2 z-[150] flex w-full max-w-[390px] -translate-x-1/2 items-center justify-center gap-3 border-t border-[var(--laed-border)] bg-[var(--laed-paper)] px-4 py-4 pb-[max(20px,env(safe-area-inset-bottom))]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={streaming}
            placeholder="Ask about project docs…"
            className="laed-input max-w-[260px] flex-1 rounded-full border border-[var(--laed-border)] px-3.5 py-2"
          />
          <button
            type="button"
            disabled={streaming}
            onClick={() => void handleSend()}
            className="flex h-10 w-10 items-center justify-center rounded-full border-none bg-[var(--laed-navy)] text-white"
            aria-label="Send"
          >
            ●
          </button>
        </div>
        {lastSources.length > 0 ? (
          <p className="px-4 pb-2 text-[8px] text-[var(--laed-muted)]">
            Cited: {lastSources.map((s) => s.filename).join(", ")}
          </p>
        ) : null}
        <BottomBar />
      </AppShell>
    </AuthGuard>
  );
}
