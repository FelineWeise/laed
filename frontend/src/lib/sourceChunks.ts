import type { SourceChunk } from "@/lib/types";

export function dedupeSourceChunks(chunks: SourceChunk[]): SourceChunk[] {
  const best = new Map<string, SourceChunk>();
  for (const chunk of chunks) {
    const key = chunk.document_id ?? chunk.filename ?? chunk.excerpt;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, chunk);
      continue;
    }
    const prevDist = prev.distance ?? Number.POSITIVE_INFINITY;
    const nextDist = chunk.distance ?? Number.POSITIVE_INFINITY;
    if (nextDist < prevDist) {
      best.set(key, chunk);
    }
  }
  return Array.from(best.values());
}

export function formatSourceLabels(chunks: SourceChunk[]): string[] {
  return dedupeSourceChunks(chunks)
    .map((c) => c.filename)
    .filter((name) => name.length > 0);
}
