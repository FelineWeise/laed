"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetchBlobUrl } from "@/lib/api";
import type { CaptureAsset } from "@/lib/types";

type Props = {
  asset: CaptureAsset | null;
  onClose: () => void;
};

/**
 * Tray quick-view: image / video / audio(+waveform) / transcript text.
 */
export function CaptureQuickView({ asset, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!asset?.download_url) {
      setUrl(null);
      setText(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setText(null);
    void (async () => {
      try {
        const objectUrl = await apiFetchBlobUrl(asset.download_url!);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = objectUrl;
        setUrl(objectUrl);
        if (asset.asset_kind === "transcript") {
          const res = await fetch(objectUrl);
          const body = await res.text();
          if (!cancelled) setText(body);
        }
        if (asset.asset_kind === "audio") {
          await drawWaveform(objectUrl, canvasRef.current);
        }
      } catch {
        if (!cancelled) setError("Could not load preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Capture preview"
      onClick={onClose}
    >
      <div
        className="relative max-h-[min(86dvh,640px)] w-full max-w-lg overflow-hidden rounded-[18px] bg-[#141210] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-white">
              {asset.filename ?? asset.asset_kind}
            </p>
            <p className="text-[9px] tracking-wide text-white/50 uppercase">
              {asset.asset_kind}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full border-none bg-white/10 px-3 py-1.5 text-[11px] text-white"
          >
            Close
          </button>
        </div>
        <div className="flex min-h-[200px] items-center justify-center p-4">
          {loading ? (
            <p className="text-[12px] text-white/60">Loading…</p>
          ) : null}
          {error ? (
            <p className="text-[12px] text-[#E08072]">{error}</p>
          ) : null}
          {!loading && !error && url && asset.asset_kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={asset.filename ?? "capture"}
              className="max-h-[min(60dvh,480px)] w-full object-contain"
            />
          ) : null}
          {!loading && !error && url && asset.asset_kind === "video" ? (
            <video
              src={url}
              controls
              playsInline
              className="max-h-[min(60dvh,480px)] w-full"
            />
          ) : null}
          {!loading && !error && url && asset.asset_kind === "audio" ? (
            <div className="flex w-full flex-col items-center gap-4">
              <canvas
                ref={canvasRef}
                width={320}
                height={64}
                className="w-full max-w-sm rounded-md bg-white/5"
              />
              <audio src={url} controls className="w-full max-w-sm" />
            </div>
          ) : null}
          {!loading && !error && asset.asset_kind === "transcript" ? (
            <pre className="max-h-[min(55dvh,420px)] w-full overflow-y-auto whitespace-pre-wrap rounded-[12px] bg-white/5 p-3 text-[12px] leading-relaxed text-white/90">
              {text ?? "—"}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function drawWaveform(
  objectUrl: string,
  canvas: HTMLCanvasElement | null,
): Promise<void> {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  try {
    const res = await fetch(objectUrl);
    const buf = await res.arrayBuffer();
    const audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(buf.slice(0));
    const data = decoded.getChannelData(0);
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / w));
    for (let x = 0; x < w; x += 1) {
      let min = 1;
      let max = -1;
      for (let i = 0; i < step; i += 1) {
        const v = data[x * step + i] ?? 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const y1 = ((1 + min) / 2) * h;
      const y2 = ((1 + max) / 2) * h;
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
    }
    ctx.stroke();
    await audioCtx.close();
  } catch {
    // Waveform is best-effort; audio element still works.
  }
}
