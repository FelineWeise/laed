"use client";

import { useCallback, useState } from "react";
import { getStoredToken } from "@/lib/api";
import {
  isOssEmbeddingUnavailableCode,
  parseHttpErrorBody,
} from "@/lib/apiErrors";
import { consumeSseResponse, type StreamResult } from "@/lib/sseClient";
import type { SourceChunk } from "@/lib/types";

export type { StreamResult } from "@/lib/sseClient";

export type ThreadAiStreamOutcome =
  | { status: "ok"; result: StreamResult }
  | { status: "oss_embedding_unavailable"; message: string }
  | { status: "error"; message: string };

export function useThreadAiStream(projectId: string) {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamReply = useCallback(
    async (
      humanMessageId: string,
      onToken: (token: string) => void,
      model: string | null = null,
      embeddingModel: string | null = null,
    ): Promise<ThreadAiStreamOutcome> => {
      setStreaming(true);
      setError(null);
      const token = getStoredToken();
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
      const params = new URLSearchParams();
      if (model && model.length > 0) {
        params.set("model", model);
      }
      if (embeddingModel && embeddingModel.length > 0) {
        params.set("embedding_model", embeddingModel);
      }
      const qs = params.toString();
      const url = `${base}/api/projects/${projectId}/messages/${humanMessageId}/ai-stream${qs ? `?${qs}` : ""}`;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok || response.body === null) {
          let detail = `AI stream failed (${response.status})`;
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
    [projectId],
  );

  return { streamReply, streaming, error };
}
