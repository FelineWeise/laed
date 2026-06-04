"use client";

import Link from "next/link";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { apiUpload } from "@/lib/api";

function Tag({
  label,
  active,
  ai,
}: {
  label: string;
  active?: boolean;
  ai?: boolean;
}) {
  return (
    <span
      className="inline-block px-2.5 py-1 text-[9px] tracking-[1px] uppercase"
      style={{
        border: ai
          ? "1px dashed var(--laed-navy)"
          : active
            ? "1px solid var(--laed-ink)"
            : "1px solid var(--laed-border)",
        background: active ? "var(--laed-ink)" : "transparent",
        color: ai
          ? "var(--laed-navy)"
          : active
            ? "#fff"
            : "var(--laed-muted)",
        borderRadius: "var(--laed-radius-sm)",
      }}
    >
      {label}
    </span>
  );
}

function RecordInner() {
  const search = useSearchParams();
  const router = useRouter();
  const projectId = search.get("projectId");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{
    transcript: string;
    file_id: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startRecording() {
    if (projectId === null) {
      setError("Open record from a project (camera button on canvas).");
      return;
    }
    setError(null);
    setResult(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      try {
        const data = await apiUpload<{
          transcript: string;
          file_id: string;
        }>(`/api/projects/${projectId}/transcribe`, fd);
        setResult({ transcript: data.transcript, file_id: data.file_id });
      } catch {
        setError("Transcription failed");
      }
    };
    mediaRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  return (
    <AuthGuard>
      <AppShell
        breadcrumb={{
          label: "← ● Recording",
          onClick: () =>
            router.push(
              projectId
                ? `/projects/${projectId}/room?tab=thread`
                : "/global",
            ),
        }}
        breadcrumbColor="var(--laed-navy)"
      >
        <div className="flex flex-1 flex-col px-4 pb-28 pt-4">
          <div className="mb-4 flex h-6 items-end justify-center gap-0.5">
            {[8, 14, 6, 18, 10, 16, 7].map((h, i) => (
              <span
                key={i}
                className="w-0.5 rounded-sm bg-[var(--laed-navy)]"
                style={{
                  height: recording ? h : 4,
                  animation: recording
                    ? `laedwave 0.6s ${i * 0.05}s infinite ease-in-out`
                    : "none",
                }}
              />
            ))}
          </div>
          <p className="text-center text-[11px] leading-relaxed text-[var(--laed-ink)]">
            {result?.transcript ??
              "…that's a separate cost item we haven't scoped yet."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Tag label="Shoreditch" active />
            <Tag label="Budget" />
            <Tag label="Planning" ai />
          </div>
          <div className="mt-auto flex flex-col items-center pt-8">
            <button
              type="button"
              onClick={() => (recording ? stopRecording() : void startRecording())}
              className="flex h-14 w-14 items-center justify-center rounded-full border-none bg-[var(--laed-navy)]"
              style={{ boxShadow: "0 0 0 8px rgba(29,58,87,0.12)" }}
              aria-label={recording ? "Stop" : "Record"}
            >
              <div className="h-[18px] w-[18px] rounded-sm bg-white" />
            </button>
            <span className="laed-label mt-2">
              {recording ? "Stop" : "Record"}
            </span>
          </div>
          {error !== null ? (
            <p className="mt-4 text-center text-[10px] text-red-700">{error}</p>
          ) : null}
          {result !== null && projectId !== null ? (
            <Link
              href={`/projects/${projectId}/room?tab=files`}
              className="mt-4 block text-center text-[10px] tracking-[1px] text-[var(--laed-navy)] uppercase"
            >
              View in Files →
            </Link>
          ) : null}
        </div>
      </AppShell>
    </AuthGuard>
  );
}

export default function RecordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center laed-label">Loading…</div>}>
      <RecordInner />
    </Suspense>
  );
}
