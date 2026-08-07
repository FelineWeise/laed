"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiUpload } from "@/lib/api";
import type { CaptureSessionPatch } from "@/lib/capturePatch";
import type { CaptureSession } from "@/lib/types";

/** Rotate MediaRecorder this often so each STT upload is a complete WebM. */
const SEGMENT_MS = 2500;
const MIN_BLOB_BYTES = 100;

type ChunkResponse = {
  transcript: string;
  delta: string;
  stt_ok?: boolean;
};

type Options = {
  sessionId: string;
  createSession: () => Promise<{ id: string }>;
  updateSession: (
    sessionId: string,
    patch: CaptureSessionPatch,
  ) => Promise<CaptureSession>;
  refresh: () => Promise<CaptureSession[]>;
  onTranscript?: (transcript: string) => void;
};

function pickAudioMime(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(c)
    ) {
      return c;
    }
  }
  return undefined;
}

/**
 * Live capture via mic → Parakeet (gateway `stt/parakeet`).
 *
 * MediaRecorder timeslices are not valid standalone WebM files and break
 * Parakeet's ffmpeg. We stop/restart the recorder on an interval so each
 * segment is a complete container.
 */
export function useSpokenRecording({
  sessionId,
  createSession,
  updateSession,
  refresh,
  onTranscript,
}: Options) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilityNote, setCapabilityNote] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");

  const mediaRef = useRef<MediaRecorder | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segmentPartsRef = useRef<Blob[]>([]);
  const fullRecordingRef = useRef<Blob[]>([]);
  const activeSessionRef = useRef(sessionId);
  const onTranscriptRef = useRef(onTranscript);
  const mimeRef = useRef<string | undefined>(undefined);
  const rotatingRef = useRef(false);

  useEffect(() => {
    activeSessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const clearRotateTimer = useCallback(() => {
    if (rotateTimerRef.current) {
      clearInterval(rotateTimerRef.current);
      rotateTimerRef.current = null;
    }
  }, []);

  const stopStreams = useCallback(() => {
    clearRotateTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;
  }, [clearRotateTimer]);

  const uploadChunk = useCallback(
    async (sid: string, blob: Blob) => {
      if (blob.size < MIN_BLOB_BYTES) return;

      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `chunk.${ext}`);

      try {
        const data = await apiUpload<ChunkResponse>(
          `/api/capture/sessions/${sid}/chunks`,
          fd,
        );
        if (data.stt_ok === false) {
          setError("Speech recognition service unavailable. Retrying…");
        } else {
          setError(null);
        }
        if (typeof data.transcript === "string") {
          setLiveTranscript(data.transcript);
          onTranscriptRef.current?.(data.transcript);
          await updateSession(sid, { transcript: data.transcript });
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 502
              ? "Speech recognition failed (STT service error)."
              : `Transcription upload failed (${err.status}).`
            : "Transcription upload failed.";
        setError(message);
      }
    },
    [updateSession],
  );

  const flushSegment = useCallback(
    async (sid: string) => {
      if (segmentPartsRef.current.length === 0) return;
      const mime = mimeRef.current ?? "audio/webm";
      const blob = new Blob(segmentPartsRef.current, { type: mime });
      segmentPartsRef.current = [];
      fullRecordingRef.current.push(blob);
      await uploadChunk(sid, blob);
    },
    [uploadChunk],
  );

  const attachRecorder = useCallback((stream: MediaStream) => {
    const mime = mimeRef.current;
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    mediaRef.current = recorder;
    segmentPartsRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) segmentPartsRef.current.push(e.data);
    };
    recorder.start();
    return recorder;
  }, []);

  const rotateSegment = useCallback(async () => {
    if (rotatingRef.current) return;
    const stream = streamRef.current;
    const sid = activeSessionRef.current;
    const recorder = mediaRef.current;
    if (!stream || !sid || !recorder || recorder.state === "inactive") return;

    rotatingRef.current = true;
    try {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      await flushSegment(sid);
      attachRecorder(stream);
    } finally {
      rotatingRef.current = false;
    }
  }, [attachRecorder, flushSegment]);

  const startRecording = useCallback(async () => {
    let sid = activeSessionRef.current;
    if (!sid) {
      const created = await createSession();
      sid = created.id;
      activeSessionRef.current = sid;
    }

    setError(null);
    setLiveTranscript("");
    segmentPartsRef.current = [];
    fullRecordingRef.current = [];
    clearRotateTimer();

    try {
      // Mic first — getDisplayMedia was confusing and often produced bad muxes for STT.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      setCapabilityNote("Live transcription");

      streamRef.current = stream;
      mimeRef.current = pickAudioMime();
      attachRecorder(stream);

      rotateTimerRef.current = setInterval(() => {
        void rotateSegment();
      }, SEGMENT_MS);

      setRecording(true);
    } catch {
      setError("Could not access microphone.");
      stopStreams();
    }
  }, [
    attachRecorder,
    clearRotateTimer,
    createSession,
    rotateSegment,
    stopStreams,
  ]);

  const stopRecording = useCallback(async () => {
    clearRotateTimer();
    const sid = activeSessionRef.current;
    const recorder = mediaRef.current;

    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    setRecording(false);

    if (sid) {
      await flushSegment(sid);
    }

    if (sid && fullRecordingRef.current.length > 0) {
      const mime = mimeRef.current ?? "audio/webm";
      const fullBlob = new Blob(fullRecordingRef.current, { type: mime });
      fullRecordingRef.current = [];
      if (fullBlob.size >= MIN_BLOB_BYTES) {
        const ext = mime.includes("mp4") ? "m4a" : "webm";
        const fd = new FormData();
        fd.append("audio", fullBlob, `recording.${ext}`);
        try {
          await apiUpload(`/api/capture/sessions/${sid}/finalize-audio`, fd);
        } catch (err) {
          const detail =
            err instanceof ApiError
              ? err.body?.slice(0, 120) || err.message
              : "unknown error";
          setError(
            err instanceof ApiError
              ? `Could not save audio (${err.status}): ${detail}`
              : "Could not save audio recording file.",
          );
        }
      }
    } else {
      fullRecordingRef.current = [];
    }

    stopStreams();

    if (sid) {
      await updateSession(sid, { status: "completed", capture_mode: "audio" });
      await refresh();
    }
  }, [
    clearRotateTimer,
    flushSegment,
    refresh,
    stopStreams,
    updateSession,
  ]);

  useEffect(() => () => stopStreams(), [stopStreams]);

  return {
    recording,
    error,
    capabilityNote,
    liveTranscript,
    startRecording,
    stopRecording,
  };
}
