"use client";

import { useCallback, useState } from "react";
import { getStoredToken } from "@/lib/api";
import type { SourceChunk } from "@/lib/types";

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

export function useThreadAiStream(projectId: string) {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamReply = useCallback(
    async (
      humanMessageId: string,
      onToken: (token: string) => void,
      model: string | null = null,
    ): Promise<StreamResult | null> => {
      setStreaming(true);
      setError(null);
      const token = getStoredToken();
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
      const params = new URLSearchParams();
      if (model && model.length > 0) {
        params.set("model", model);
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
          setError(`AI stream failed (${response.status})`);
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

        if (streamFailed) return null;
        return { content: full, sourceChunks, messageId };
      } catch {
        setError("Stream interrupted");
        return null;
      } finally {
        setStreaming(false);
      }
    },
    [projectId],
  );

  return { streamReply, streaming, error };
}
