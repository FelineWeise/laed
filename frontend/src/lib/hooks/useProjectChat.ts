"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getStoredToken } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

export function useProjectChat(projectId: string, topicId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const loadHistory = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (topicId !== null) {
      params.set("topic_node_id", topicId);
    }
    const data = await apiFetch<ChatMessage[]>(
      `/api/projects/${projectId}/messages?${params.toString()}`,
    );
    setMessages(data);
  }, [projectId, topicId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const token = getStoredToken();
    if (token === null) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/projects/${projectId}/chat?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data) as ChatMessage & { type?: string };
        if (raw.type !== undefined && raw.type !== "message") return;
        const msg: ChatMessage = {
          id: raw.id,
          project_id: raw.project_id ?? projectId,
          content: raw.content,
          is_anonymous: raw.is_anonymous,
          topic_node_id: raw.topic_node_id,
          sender_label: raw.sender_label,
          user_id: raw.user_id,
          created_at: raw.created_at,
        };
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } catch {
        /* ignore malformed */
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId]);

  const send = useCallback(
    (content: string, isAnonymous: boolean) => {
      const ws = wsRef.current;
      if (ws === null || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: "message",
          content,
          is_anonymous: isAnonymous,
          topic_node_id: topicId,
        }),
      );
    },
    [topicId],
  );

  return { messages, connected, send, reload: loadHistory };
}
