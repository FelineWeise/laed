"use client";

import { useCallback, useState } from "react";
import { getStoredToken } from "@/lib/api";
import type { SourceChunk } from "@/lib/types";

type StreamResult = {
  content: string;
  sourceChunks: SourceChunk[];
  messageId: string | null;
};

export function useAiStream() {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamMessage = useCallback(
    async (
      projectId: string,
      conversationId: string,
      content: string,
      topicNodeId: string | null,
      onToken: (token: string) => void,
    ): Promise<StreamResult | null> => {
      setStreaming(true);
      setError(null);
      const token = getStoredToken();
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "";

      try {
        const response = await fetch(
          `${base}/api/projects/${projectId}/ai/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              content,
              topic_node_id: topicNodeId,
            }),
          },
        );

        if (!response.ok || response.body === null) {
          setError("AI request failed");
          return null;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";
        let sourceChunks: SourceChunk[] = [];
        let messageId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const block of parts) {
            const lines = block.split("\n");
            let event = "";
            let dataLine = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) event = line.slice(7);
              if (line.startsWith("data: ")) dataLine = line.slice(6);
            }
            if (event === "token" && dataLine) {
              const parsed = JSON.parse(dataLine) as { content?: string };
              if (parsed.content) {
                full += parsed.content;
                onToken(parsed.content);
              }
            }
            if (event === "done" && dataLine) {
              const parsed = JSON.parse(dataLine) as {
                message_id?: string;
                source_chunks?: SourceChunk[];
              };
              messageId = parsed.message_id ?? null;
              sourceChunks = parsed.source_chunks ?? [];
            }
            if (event === "error") {
              setError("Stream error");
            }
          }
        }

        return { content: full, sourceChunks, messageId };
      } catch {
        setError("Stream interrupted");
        return null;
      } finally {
        setStreaming(false);
      }
    },
    [],
  );

  return { streamMessage, streaming, error };
}
