"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CaptureAsset } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  sessionId: string;
};

function kindLabel(kind: CaptureAsset["asset_kind"]): string {
  switch (kind) {
    case "audio":
      return "Audio";
    case "video":
      return "Video";
    case "transcript":
      return "Transcript";
    default:
      return "Image";
  }
}

export function CaptureArtifactsDrawer({ open, onClose, sessionId }: Props) {
  const [assets, setAssets] = useState<CaptureAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (sessionId === "") return;
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<CaptureAsset[]>(
        `/api/capture/sessions/${sessionId}/assets`,
      );
      setAssets(list);
    } catch {
      setError("Could not load artifacts.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (open && sessionId !== "") {
      void refresh();
    }
  }, [open, sessionId, refresh]);

  if (!open) return null;

  const media = assets.filter((a) => a.asset_kind !== "transcript");
  const transcripts = assets.filter((a) => a.asset_kind === "transcript");

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[160] cursor-default border-none bg-black/30"
        aria-label="Close artifacts"
        onClick={onClose}
      />
      <aside
        className="fixed inset-x-0 bottom-[92px] z-[165] mx-auto max-h-[min(55dvh,28rem)] max-w-[480px] overflow-y-auto rounded-t-[var(--laed-radius-md)] border border-[var(--laed-border)] px-4 py-4 shadow-[var(--laed-shadow-pop)]"
        style={{ background: "var(--laed-paper-elevated)" }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="laed-label">Captured artifacts</p>
          <button
            type="button"
            onClick={onClose}
            className="border-none bg-transparent text-[10px] text-[var(--laed-muted)]"
          >
            Close
          </button>
        </div>
        {loading ? (
          <p className="text-[10px] text-[var(--laed-muted)]">Loading…</p>
        ) : error ? (
          <p className="text-[10px] text-[var(--laed-warn)]">{error}</p>
        ) : assets.length === 0 ? (
          <p className="text-[10px] text-[var(--laed-muted)]">
            Nothing saved yet for this session. Capture photo, video, or audio to
            see downloads here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {media.length > 0 ? (
              <div>
                <p className="mb-2 text-[9px] font-semibold tracking-[0.8px] text-[var(--laed-muted)] uppercase">
                  Media
                </p>
                <ul className="flex flex-col gap-2">
                  {media.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--laed-border)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[11px] text-[var(--laed-ink)]">
                          {a.filename ?? kindLabel(a.asset_kind)}
                        </p>
                        <p className="text-[9px] text-[var(--laed-muted)]">
                          {kindLabel(a.asset_kind)}
                          {a.transcoded ? " · transcoded" : ""}
                        </p>
                      </div>
                      {a.download_url ? (
                        <a
                          href={a.download_url}
                          download={a.filename ?? undefined}
                          className="laed-btn-private shrink-0 px-2 py-1 text-[8px]"
                        >
                          Download
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {transcripts.length > 0 ? (
              <div>
                <p className="mb-2 text-[9px] font-semibold tracking-[0.8px] text-[var(--laed-muted)] uppercase">
                  Transcripts
                </p>
                <ul className="flex flex-col gap-2">
                  {transcripts.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--laed-border)] px-3 py-2"
                    >
                      <span className="text-[11px] text-[var(--laed-ink)]">
                        {a.filename ?? "transcript.txt"}
                      </span>
                      {a.download_url ? (
                        <a
                          href={a.download_url}
                          download={a.filename ?? undefined}
                          className="laed-btn-private shrink-0 px-2 py-1 text-[8px]"
                        >
                          Download
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}
