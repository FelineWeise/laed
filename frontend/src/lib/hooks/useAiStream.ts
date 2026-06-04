"use client";

import { useCallback, useState } from "react";
import { getStoredToken } from "@/lib/api";
import type { ExplicitContextItem, SourceChunk } from "@/lib/types";

export type RetrievalScopePayload = {
  level: "global" | "project" | "topic";
  project_ids?: string[];
  topic_ids?: string[];
  include_linked?: boolean;
  include_constituent_topics?: boolean;
  session_scope_id?: string | null;
};

type StreamOptions = {
  projectId?: string;
  conversationId: string;
  content: string;
  topicNodeId?: string | null;
  model?: string | null;
  retrievalScope?: RetrievalScopePayload | null;
  explicitContext?: ExplicitContextItem[];
};

type StreamResult = {
  content: string;
  sourceChunks: SourceChunk[];
  messageId: string | null;
};

function parseSseBlock(block: string): { event: string; dataLine: string } {
  let event = "";
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    if (line.startsWith("data: ")) dataLine = line.slice(6);
  }
  return { event, dataLine };
}

export function useAiStream() {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamMessage = useCallback(
    async (
      options: StreamOptions,
      onToken: (token: string) => void,
    ): Promise<StreamResult | null> => {
      const {
        projectId,
        conversationId,
        content,
        topicNodeId = null,
        model = null,
        retrievalScope = null,
        explicitContext = [],
      } = options;

      setStreaming(true);
      setError(null);
      const token = getStoredToken();
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "";

      const isWorkspace = projectId === undefined || projectId === "";
      const url = isWorkspace
        ? `${base}/api/ai/conversations/${conversationId}/messages`
        : `${base}/api/projects/${projectId}/ai/conversations/${conversationId}/messages`;

      type StreamBody = {
        content: string;
        topic_node_id?: string | null;
        model?: string;
        retrieval_scope?: RetrievalScopePayload;
        explicit_context?: ExplicitContextItem[];
      };
      const body: StreamBody = { content };
      if (explicitContext.length > 0) {
        body.explicit_context = explicitContext;
      }
      if (!isWorkspace) {
        body.topic_node_id = topicNodeId;
        if (model) body.model = model;
        if (retrievalScope) body.retrieval_scope = retrievalScope;
      } else if (model) {
        body.model = model;
      }

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });

        if (!response.ok || response.body === null) {
          setError(`AI request failed (${response.status})`);
          return null;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";
        let sourceChunks: SourceChunk[] = [];
        let messageId: string | null = null;
        let streamFailed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const block of parts) {
            const { event, dataLine } = parseSseBlock(block);
            if (!dataLine) continue;
            try {
              if (event === "token") {
                const parsed = JSON.parse(dataLine) as { content?: string };
                if (parsed.content) {
                  full += parsed.content;
                  onToken(parsed.content);
                }
              }
              if (event === "done") {
                const parsed = JSON.parse(dataLine) as {
                  message_id?: string;
                  source_chunks?: SourceChunk[];
                };
                messageId = parsed.message_id ?? null;
                sourceChunks = parsed.source_chunks ?? [];
              }
              if (event === "error") {
                const parsed = JSON.parse(dataLine) as { error?: string };
                setError(parsed.error ?? "Stream error");
                streamFailed = true;
              }
            } catch {
              /* skip malformed block */
            }
          }
        }

        if (streamFailed || (full.length === 0 && messageId === null)) {
          return null;
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
