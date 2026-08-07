import type { SourceChunk } from "@/lib/types";

export type StreamResult = {
  content: string;
  sourceChunks: SourceChunk[];
  messageId: string | null;
};

export type SseEvent = {
  event: string;
  data: string;
};

type SseJsonPayload = {
  content?: string;
  message_id?: string;
  source_chunks?: SourceChunk[];
  error?: string;
  message?: string;
  code?: string;
};

export type ParsedSsePayload =
  | { kind: "token"; content: string }
  | {
      kind: "done";
      messageId: string | null;
      sourceChunks: SourceChunk[];
      content: string | null;
    }
  | { kind: "error"; message: string; code: string | null };

export function parseSseBlock(block: string): SseEvent {
  let event = "";
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return { event, data: dataLines.join("\n") };
}

function parseSseJson(data: string): SseJsonPayload | null {
  try {
    const parsed = JSON.parse(data) as SseJsonPayload;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sourceChunksFromPayload(parsed: SseJsonPayload): SourceChunk[] {
  const chunks = parsed.source_chunks;
  if (!Array.isArray(chunks)) {
    return [];
  }
  return chunks.filter(
    (chunk): chunk is SourceChunk =>
      typeof chunk === "object" &&
      chunk !== null &&
      typeof chunk.filename === "string" &&
      typeof chunk.excerpt === "string",
  );
}

function inferEventName(parsed: SseJsonPayload): string {
  if (typeof parsed.error === "string") return "error";
  if (typeof parsed.message_id === "string") return "done";
  if (typeof parsed.content === "string") return "token";
  return "";
}

export function interpretSseEvent(event: string, data: string): ParsedSsePayload | null {
  const parsed = parseSseJson(data);
  if (!parsed) return null;

  const eventName = event || inferEventName(parsed);
  if (eventName === "token") {
    const content = parsed.content;
    if (typeof content === "string" && content.length > 0) {
      return { kind: "token", content };
    }
    return null;
  }
  if (eventName === "done") {
    return {
      kind: "done",
      messageId: typeof parsed.message_id === "string" ? parsed.message_id : null,
      sourceChunks: sourceChunksFromPayload(parsed),
      content: typeof parsed.content === "string" ? parsed.content : null,
    };
  }
  if (eventName === "error") {
    const message =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.message === "string"
          ? parsed.message
          : "Stream error";
    const code = typeof parsed.code === "string" ? parsed.code : null;
    return { kind: "error", message, code };
  }
  return null;
}

export async function consumeSseResponse(
  response: Response,
  onEvent: (payload: ParsedSsePayload) => void,
): Promise<void> {
  if (response.body === null) {
    throw new Error("Empty response body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const block of parts) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const { event, data } = parseSseBlock(trimmed);
      const payload = interpretSseEvent(event, data);
      if (payload) onEvent(payload);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const { event, data } = parseSseBlock(tail);
    const payload = interpretSseEvent(event, data);
    if (payload) onEvent(payload);
  }
}
