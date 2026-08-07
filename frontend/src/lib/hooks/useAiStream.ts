"use client";

import { useCallback, useState } from "react";
import { getStoredToken } from "@/lib/api";
import {
  isOssEmbeddingUnavailableCode,
  parseHttpErrorBody,
} from "@/lib/apiErrors";
import { consumeSseResponse, type StreamResult } from "@/lib/sseClient";
import type { ExplicitContextItem, SourceChunk } from "@/lib/types";

export type { StreamResult };

export type AiStreamOutcome =
  | { status: "ok"; result: StreamResult }
  | { status: "oss_embedding_unavailable"; message: string }
  | { status: "error"; message: string };

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
  embeddingModel?: string | null;
  retrievalScope?: RetrievalScopePayload | null;
  explicitContext?: ExplicitContextItem[];
};

export function useAiStream() {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamMessage = useCallback(
    async (
      options: StreamOptions,
      onToken: (token: string) => void,
    ): Promise<AiStreamOutcome> => {
      const {
        projectId,
        conversationId,
        content,
        topicNodeId = null,
        model = null,
        embeddingModel = null,
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
        embedding_model?: string;
        retrieval_scope?: RetrievalScopePayload;
        explicit_context?: ExplicitContextItem[];
      };
      const body: StreamBody = { content };
      if (explicitContext.length > 0) {
        body.explicit_context = explicitContext;
      }
      if (embeddingModel) {
        body.embedding_model = embeddingModel;
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
          let detail = `AI request failed (${response.status})`;
          let code: string | null = null;
          try {
            const errBody = await response.text();
            if (errBody) {
              const parsed = parseHttpErrorBody(errBody);
              detail = parsed.message;
              code = parsed.code;
            }
          } catch {
            /* ignore */
          }
          if (isOssEmbeddingUnavailableCode(code)) {
            setError(null);
            return { status: "oss_embedding_unavailable", message: detail };
          }
          setError(detail);
          return { status: "error", message: detail };
        }

        let full = "";
        let sourceChunks: SourceChunk[] = [];
        let messageId: string | null = null;
        let streamFailed = false;
        let ossBlocked = false;
        let ossMessage = "On-device embedding is unavailable.";

        await consumeSseResponse(response, (payload) => {
          if (payload.kind === "token") {
            full += payload.content;
            onToken(payload.content);
          }
          if (payload.kind === "done") {
            messageId = payload.messageId;
            sourceChunks = payload.sourceChunks;
            if (payload.content && full.length === 0) {
              full = payload.content;
              onToken(payload.content);
            }
          }
          if (payload.kind === "error") {
            if (isOssEmbeddingUnavailableCode(payload.code)) {
              setError(null);
              streamFailed = true;
              ossBlocked = true;
              ossMessage = payload.message;
            } else {
              setError(payload.message);
              streamFailed = true;
            }
          }
        });

        if (streamFailed && ossBlocked) {
          return { status: "oss_embedding_unavailable", message: ossMessage };
        }
        if (streamFailed) {
          return { status: "error", message: "Stream error" };
        }
        if (full.length === 0 && messageId === null) {
          setError("No response from AI");
          return { status: "error", message: "No response from AI" };
        }

        return {
          status: "ok",
          result: { content: full, sourceChunks, messageId },
        };
      } catch {
        setError("Stream interrupted");
        return { status: "error", message: "Stream interrupted" };
      } finally {
        setStreaming(false);
      }
    },
    [],
  );

  return { streamMessage, streaming, error };
}
