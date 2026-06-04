"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiWebSocketUrl, getStoredToken } from "@/lib/api";
import { useThreadAiStream } from "@/lib/hooks/useThreadAiStream";
import type { ChatMessage, ExplicitContextItem } from "@/lib/types";

type WsPayload = ChatMessage & {
  type?: string;
  message_type?: string;
  source_chunks?: ChatMessage["source_chunks"];
  reply_to_id?: string | null;
  thread_session_id?: string | null;
  invoke_ai?: boolean;
};

function payloadToMessage(raw: WsPayload, projectId: string): ChatMessage {
  return {
    id: raw.id,
    project_id: raw.project_id ?? projectId,
    content: raw.content,
    is_anonymous: raw.is_anonymous,
    message_type: raw.message_type,
    topic_node_id: raw.topic_node_id ?? null,
    thread_session_id: raw.thread_session_id ?? null,
    sender_label: raw.sender_label,
    user_id: raw.user_id,
    created_at: raw.created_at,
    source_chunks: raw.source_chunks ?? null,
    reply_to_id: raw.reply_to_id ?? null,
    mentions: raw.mentions ?? [],
    reply_preview: raw.reply_preview ?? null,
  };
}

function sessionMatches(
  msgSession: string | null | undefined,
  activeSessionId: string,
): boolean {
  if (activeSessionId === "") return false;
  if (msgSession === null || msgSession === undefined || msgSession === "") {
    return false;
  }
  return msgSession.toLowerCase() === activeSessionId.toLowerCase();
}

function matchesFilters(
  raw: WsPayload,
  topicId: string | null,
  sessionId: string,
): boolean {
  const msgTopic = raw.topic_node_id ?? null;
  if (topicId !== null && msgTopic !== topicId) return false;
  if (topicId === null && msgTopic !== null) return false;
  return sessionMatches(raw.thread_session_id, sessionId);
}

const AI_MENTION = /@(?:ai|laed)\b/i;

export function useProjectChat(
  projectId: string,
  topicId: string | null,
  sessionId: string,
  sessionAiEnabled: boolean,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const topicIdRef = useRef(topicId);
  const sessionIdRef = useRef(sessionId);
  const sessionAiRef = useRef(sessionAiEnabled);
  const streamedIdsRef = useRef<Set<string>>(new Set());
  const { streamReply, streaming: streamingAi, error: streamError } =
    useThreadAiStream(projectId);

  topicIdRef.current = topicId;
  sessionIdRef.current = sessionId;
  sessionAiRef.current = sessionAiEnabled;

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const loadHistory = useCallback(async () => {
    if (sessionId === "") return;
    const params = new URLSearchParams({ limit: "50" });
    if (topicId !== null) {
      params.set("topic_node_id", topicId);
    }
    params.set("thread_session_id", sessionId);
    const data = await apiFetch<WsPayload[]>(
      `/api/projects/${projectId}/messages?${params.toString()}`,
    );
    setMessages(
      data
        .filter((row) => row.type === undefined || row.type === "message")
        .map((row) => payloadToMessage(row, projectId)),
    );
  }, [projectId, topicId, sessionId]);

  useEffect(() => {
    if (sessionId === "") {
      setMessages([]);
      return;
    }
    streamedIdsRef.current.clear();
    void loadHistory().catch(() => setMessages([]));
  }, [loadHistory, sessionId]);

  const startAiStream = useCallback(
    async (humanMessageId: string, model: string | null) => {
      if (streamedIdsRef.current.has(humanMessageId)) return;
      streamedIdsRef.current.add(humanMessageId);
      setStreamText("");
      await streamReply(
        humanMessageId,
        (token) => setStreamText((prev) => prev + token),
        model,
      );
      setStreamText("");
      await loadHistory();
    },
    [streamReply, loadHistory],
  );

  useEffect(() => {
    const authToken = getStoredToken();
    if (authToken === null) {
      setConnected(false);
      setConnectionError("Not signed in");
      return;
    }

    const wsUrl = `${apiWebSocketUrl(`/ws/projects/${projectId}/chat`)}?token=${encodeURIComponent(authToken)}`;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleReconnect() {
      if (cancelled) return;
      retryTimer = setTimeout(() => connect(), 3000);
    }

    function connect() {
      if (cancelled) return;
      setConnectionError(null);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setConnectionError(null);
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (cancelled) return;
        setConnectionError("Live connection unavailable");
        setConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data) as WsPayload;
          if (raw.type !== undefined && raw.type !== "message") return;
          if (
            !matchesFilters(
              raw,
              topicIdRef.current,
              sessionIdRef.current,
            )
          ) {
            return;
          }
          appendMessage(payloadToMessage(raw, projectId));
        } catch {
          /* ignore malformed */
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [projectId, appendMessage, startAiStream]);

  const send = useCallback(
    async (
      content: string,
      isAnonymous: boolean,
      explicitContext: ExplicitContextItem[] = [],
      model: string | null = null,
      replyToId: string | null = null,
      mentionedUserIds: string[] = [],
    ) => {
      if (sessionId === "") return;
      const wantsAi =
        sessionAiRef.current || AI_MENTION.test(content);
      setSending(true);
      try {
        const body = {
          content,
          is_anonymous: isAnonymous,
          topic_node_id: topicId,
          thread_session_id: sessionId,
          explicit_context: explicitContext,
          model: model && model.length > 0 ? model : null,
          include_ai: sessionAiRef.current,
          reply_to_id: replyToId,
          mentioned_user_ids: mentionedUserIds,
        };

        const ws = wsRef.current;
        const useHttp =
          wantsAi || ws === null || ws.readyState !== WebSocket.OPEN;

        if (!useHttp && ws !== null) {
          ws.send(JSON.stringify({ type: "message", ...body }));
          return;
        }

        const raw = await apiFetch<WsPayload & { invoke_ai?: boolean }>(
          `/api/projects/${projectId}/messages`,
          { method: "POST", body: JSON.stringify(body) },
        );
        if (matchesFilters(raw, topicId, sessionId)) {
          appendMessage(payloadToMessage(raw, projectId));
        }
        if (raw.invoke_ai && raw.id) {
          await startAiStream(raw.id, model);
        }
      } finally {
        setSending(false);
      }
    },
    [
      projectId,
      topicId,
      sessionId,
      appendMessage,
      startAiStream,
    ],
  );

  return {
    messages,
    connected,
    connectionError,
    sending,
    send,
    reload: loadHistory,
    streamText,
    streamingAi,
    streamError,
  };
};
