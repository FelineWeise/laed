"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { CaptureAttachSheet } from "@/components/CaptureAttachSheet";
import { CaptureQuickView } from "@/components/CaptureQuickView";
import { PrivateCaptureShell } from "@/components/PrivateCaptureShell";
import { Tip } from "@/components/Tip";
import { Camera, Mic } from "@/components/icons";
import { apiFetch, apiFetchBlobUrl, apiUpload } from "@/lib/api";
import {
  captureSessionLabel,
  useCaptureSessions,
} from "@/lib/hooks/useCaptureSessions";
import { useSpokenRecording } from "@/lib/hooks/useSpokenRecording";
import type { CaptureAsset } from "@/lib/types";

type LastCapturePreview = {
  kind: "image" | "video";
  url: string;
};

function CaptureWave({ active }: { active: boolean }) {
  const heights = [10, 16, 22, 12, 20, 26, 14, 8, 18, 24, 12, 18, 8, 22, 14, 20, 10, 24];
  return (
    <div className="flex h-[34px] items-center justify-center gap-[3.5px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-sm bg-white/75"
          style={{
            height: active ? h : 5,
            animation: active
              ? `laedwave 0.7s ${i * 0.05}s infinite ease-in-out`
              : "none",
            transition: "height 0.25s",
          }}
        />
      ))}
    </div>
  );
}

function ViewfinderCorners() {
  const corners = ["tl", "tr", "bl", "br"] as const;
  return (
    <>
      {corners.map((pos) => {
        const style: React.CSSProperties = {
          position: "absolute",
          width: 30,
          height: 30,
          borderColor: "rgba(255,255,255,0.6)",
          borderStyle: "solid",
          borderWidth: 0,
        };
        const m = 22;
        if (pos === "tl") {
          Object.assign(style, {
            top: m,
            left: m,
            borderTopWidth: 2,
            borderLeftWidth: 2,
            borderTopLeftRadius: 8,
          });
        }
        if (pos === "tr") {
          Object.assign(style, {
            top: m,
            right: m,
            borderTopWidth: 2,
            borderRightWidth: 2,
            borderTopRightRadius: 8,
          });
        }
        if (pos === "bl") {
          Object.assign(style, {
            bottom: m,
            left: m,
            borderBottomWidth: 2,
            borderLeftWidth: 2,
            borderBottomLeftRadius: 8,
          });
        }
        if (pos === "br") {
          Object.assign(style, {
            bottom: m,
            right: m,
            borderBottomWidth: 2,
            borderRightWidth: 2,
            borderBottomRightRadius: 8,
          });
        }
        return <span key={pos} style={style} />;
      })}
    </>
  );
}

function CaptureInner() {
  const router = useRouter();
  const search = useSearchParams();
  const prefillProjectId = search.get("projectId");
  const modeParam = search.get("mode");

  const [surface, setSurface] = useState<"camera" | "audio">(
    modeParam === "Audio" ? "audio" : "camera",
  );
  const [videoRec, setVideoRec] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<CaptureAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [quickViewAsset, setQuickViewAsset] = useState<CaptureAsset | null>(
    null,
  );
  const [lastCapture, setLastCapture] = useState<LastCapturePreview | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoModeRef = useRef(false);

  const cameraSessions = useCaptureSessions("camera", true);
  const spokenSessions = useCaptureSessions("spoken", true);
  const active = surface === "audio" ? spokenSessions : cameraSessions;

  const spoken = useSpokenRecording({
    sessionId: spokenSessions.selectedId,
    createSession: () => spokenSessions.createNew({ capture_mode: "audio" }),
    updateSession: spokenSessions.updateSession,
    refresh: spokenSessions.refresh,
  });

  const revokeLastCapture = useCallback(() => {
    setLastCapture((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current?.stop();
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      revokeLastCapture();
    };
  }, [revokeLastCapture]);

  const sessionIdForAssets =
    surface === "audio"
      ? spokenSessions.selectedId
      : cameraSessions.selectedId;

  const refreshAssets = useCallback(async () => {
    if (!sessionIdForAssets) {
      setAssets([]);
      return;
    }
    const list = await apiFetch<CaptureAsset[]>(
      `/api/capture/sessions/${sessionIdForAssets}/assets`,
    );
    setAssets(list);
    setSelectedAssetId((cur) => {
      if (cur && list.some((a) => a.id === cur)) return cur;
      return list[0]?.id ?? null;
    });
  }, [sessionIdForAssets]);

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  const maybePrefillProject = useCallback(
    async (sessionId: string) => {
      if (!prefillProjectId) return;
      await active.updateSession(sessionId, { project_id: prefillProjectId });
    },
    [active, prefillProjectId],
  );

  const ensureCameraSession = useCallback(async () => {
    if (cameraSessions.selectedId) {
      await cameraSessions.updateSession(cameraSessions.selectedId, {
        capture_mode: "photo",
      });
      return cameraSessions.selectedId;
    }
    const created = await cameraSessions.createNew({ capture_mode: "photo" });
    await maybePrefillProject(created.id);
    return created.id;
  }, [cameraSessions, maybePrefillProject]);

  const stagePreviewFromAsset = useCallback(
    async (asset: CaptureAsset) => {
      if (!asset.download_url) return;
      if (asset.asset_kind !== "image" && asset.asset_kind !== "video") return;
      try {
        const objectUrl = await apiFetchBlobUrl(asset.download_url);
        revokeLastCapture();
        setLastCapture({
          kind: asset.asset_kind === "video" ? "video" : "image",
          url: objectUrl,
        });
      } catch {
        // Preview is best-effort
      }
    },
    [revokeLastCapture],
  );

  const capturePhoto = async () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    revokeLastCapture();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      ctx.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) return;
      const localUrl = URL.createObjectURL(blob);
      setLastCapture({ kind: "image", url: localUrl });
      const sid = await ensureCameraSession();
      const fd = new FormData();
      fd.append("image", blob, "photo.jpg");
      fd.append("media_role", "image");
      fd.append("capture_mode", "photo");
      const uploaded = await apiUpload<CaptureAsset>(
        `/api/capture/sessions/${sid}/assets`,
        fd,
      );
      await cameraSessions.refresh();
      await refreshAssets();
      if (uploaded?.download_url) {
        void stagePreviewFromAsset(uploaded);
      }
    } catch {
      fileRef.current?.click();
    }
  };

  const stopVideo = () => {
    mediaRecorderRef.current?.stop();
    setVideoRec(false);
    videoModeRef.current = false;
  };

  const startVideo = async () => {
    revokeLastCapture();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
      }
      videoChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void (async () => {
          const blob = new Blob(videoChunksRef.current, { type: "video/webm" });
          stream.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
          if (blob.size < 100) return;
          const localUrl = URL.createObjectURL(blob);
          setLastCapture({ kind: "video", url: localUrl });
          const sid = await ensureCameraSession();
          const fd = new FormData();
          fd.append("image", blob, "video.webm");
          fd.append("media_role", "video");
          fd.append("capture_mode", "video");
          try {
            const uploaded = await apiUpload<CaptureAsset>(
              `/api/capture/sessions/${sid}/assets`,
              fd,
            );
            await cameraSessions.refresh();
            await refreshAssets();
            if (uploaded?.download_url) {
              void stagePreviewFromAsset(uploaded);
            }
          } catch {
            setError("Video upload failed");
          }
        })();
      };
      recorder.start(1000);
      setVideoRec(true);
      videoModeRef.current = true;
    } catch {
      setError("Could not access camera for video.");
    }
  };

  const onCameraPointerDown = () => {
    if (surface !== "camera") return;
    if (videoRec) {
      stopVideo();
      return;
    }
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      void startVideo();
    }, 480);
  };

  const onCameraPointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      if (!videoModeRef.current && !videoRec) {
        void capturePhoto();
      }
    }
  };

  const toggleMic = () => {
    setError(null);
    revokeLastCapture();
    setSurface("audio");
    if (spoken.recording) {
      void spoken.stopRecording().then(() => {
        void spokenSessions.refresh();
        void refreshAssets();
      });
    } else {
      void spoken.startRecording();
    }
  };

  async function handleFilePick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const sid = await ensureCameraSession();
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("media_role", "image");
        fd.append("capture_mode", "photo");
        await apiUpload(`/api/capture/sessions/${sid}/assets`, fd);
      }
      await cameraSessions.refresh();
      await refreshAssets();
    } catch {
      setError("Upload failed");
    }
  }

  const recActive = surface === "audio" ? spoken.recording : videoRec;
  const transcript =
    spoken.liveTranscript || spokenSessions.selected?.transcript || "";
  const selected = active.selected;

  async function copyTranscript() {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 1600);
    } catch {
      setError("Could not copy transcript");
    }
  }

  const onTraySelect = (id: string) => {
    setSelectedAssetId(id);
  };

  const onTrayPreview = (id: string) => {
    const asset = assets.find((a) => a.id === id) ?? null;
    if (asset) setQuickViewAsset(asset);
  };

  return (
    <AuthGuard>
      <PrivateCaptureShell
        title="Capture"
        onBack={() => router.push("/global")}
        recording={recActive}
        sessionTitle={selected ? captureSessionLabel(selected) : undefined}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className="relative mx-0 flex min-h-0 flex-1 items-center justify-center overflow-hidden"
            style={{ background: "#17150F" }}
          >
            {surface === "camera" && !lastCapture ? <ViewfinderCorners /> : null}

            {lastCapture?.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lastCapture.url}
                alt="Last capture"
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : null}
            {lastCapture?.kind === "video" && !videoRec ? (
              <video
                src={lastCapture.url}
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : null}

            {videoRec ? (
              <video
                ref={videoRef}
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}

            {surface === "audio" && !lastCapture ? (
              <div className="absolute inset-x-0 top-0 bottom-[120px] flex flex-col items-center justify-center gap-[18px] px-[26px]">
                <div
                  className="flex h-[54px] w-[54px] items-center justify-center rounded-full transition-all"
                  style={{
                    background: recActive
                      ? "rgba(176,72,58,0.22)"
                      : "rgba(255,255,255,0.1)",
                    boxShadow: recActive
                      ? "0 0 0 10px rgba(176,72,58,0.10)"
                      : "none",
                  }}
                >
                  <Mic
                    size={22}
                    color={recActive ? "#E08072" : "rgba(255,255,255,0.75)"}
                  />
                </div>
                <CaptureWave active={recActive} />
                {transcript ? (
                  <div className="max-h-[40%] w-full max-w-full overflow-y-auto rounded-[14px] bg-white/10 px-3.5 py-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="text-[9px] font-semibold tracking-[0.8px] text-white/65 uppercase">
                        Live transcription
                      </span>
                      <Tip tip="Copy transcript" placement="below">
                        <button
                          type="button"
                          onClick={() => void copyTranscript()}
                          className="ml-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-white/10 p-0 text-white/80"
                          aria-label="Copy transcript"
                        >
                          Copy
                        </button>
                      </Tip>
                    </div>
                    <div className="select-text text-[12px] leading-[1.55] text-white/90">
                      {transcript}
                      {recActive ? (
                        <span
                          className="ml-1 inline-block h-3 w-1.5 bg-white/70 align-middle"
                          style={{ animation: "laedpulse 0.9s infinite" }}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-[12px] tracking-[0.3px] text-white/60">
                    {recActive
                      ? "Listening…"
                      : "Press the mic for live transcription"}
                  </div>
                )}
                {copyToast ? (
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[9px] text-[var(--laed-ink)]">
                    Copied
                  </span>
                ) : null}
              </div>
            ) : null}

            {surface === "camera" && !lastCapture && !videoRec ? (
              <div className="relative z-10 text-center text-white/60">
                <div className="mb-2.5 flex justify-center">
                  <Camera size={30} />
                </div>
                <div className="text-[12px] tracking-[0.3px]">
                  Tap to capture · hold for video
                </div>
              </div>
            ) : null}

            {videoRec ? (
              <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-xl bg-[rgba(176,72,58,0.25)] px-2.5 py-1">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#E08072]"
                  style={{ animation: "laedpulse 1s infinite" }}
                />
                <span className="text-[10.5px] font-semibold text-[#F0B4AA] tabular-nums">
                  REC
                </span>
              </div>
            ) : null}

            {flash ? (
              <div className="pointer-events-none absolute inset-0 bg-white/40" />
            ) : null}

            <div className="absolute right-0 bottom-[132px] left-0 z-20 flex items-center justify-center gap-5 px-7">
              <Tip tip="Live transcription" placement="above">
                <button
                  type="button"
                  onClick={toggleMic}
                  className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-none"
                  style={{
                    background:
                      surface === "audio" && recActive
                        ? "rgba(176,72,58,0.85)"
                        : "rgba(255,255,255,0.14)",
                    color: "#fff",
                  }}
                  aria-label="Live transcription"
                >
                  <Mic size={22} color="currentColor" />
                </button>
              </Tip>
              <Tip tip="Tap photo · hold video" placement="above">
                <button
                  type="button"
                  onPointerDown={onCameraPointerDown}
                  onPointerUp={onCameraPointerUp}
                  onPointerLeave={() => {
                    if (longPressTimer.current) {
                      clearTimeout(longPressTimer.current);
                      longPressTimer.current = null;
                    }
                  }}
                  onClick={() => setSurface("camera")}
                  className="flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-full border-[3px] bg-transparent p-0"
                  style={{
                    borderColor: videoRec
                      ? "rgba(176,72,58,0.35)"
                      : "rgba(255,255,255,0.35)",
                  }}
                  aria-label={videoRec ? "Stop video" : "Camera"}
                >
                  <span
                    style={{
                      width: videoRec ? 28 : 54,
                      height: videoRec ? 28 : 54,
                      borderRadius: videoRec ? 8 : "50%",
                      background: videoRec
                        ? "#B0483A"
                        : "var(--laed-private-accent)",
                      display: "block",
                      transition: "all 0.2s",
                    }}
                  />
                </button>
              </Tip>
            </div>
          </div>

          {error || spoken.error ? (
            <p className="absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[10px] text-[#F0B4AA]">
              {error ?? spoken.error}
            </p>
          ) : null}

          <CaptureAttachSheet
            assets={assets}
            selectedAssetId={selectedAssetId}
            onSelectAsset={onTraySelect}
            onPreviewAsset={onTrayPreview}
            onAttached={() => void refreshAssets()}
            toast={toast}
            setToast={setToast}
          />

          <CaptureQuickView
            asset={quickViewAsset}
            onClose={() => setQuickViewAsset(null)}
          />

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleFilePick(e.target.files)}
          />
        </div>
      </PrivateCaptureShell>
    </AuthGuard>
  );
}

export default function CapturePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center laed-label">Loading…</div>
      }
    >
      <CaptureInner />
    </Suspense>
  );
}
