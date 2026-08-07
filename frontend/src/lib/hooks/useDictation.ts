"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUpload } from "@/lib/api";

type TranscribeResponse = { transcript: string };

/**
 * Dictation into a text field via MediaRecorder → gateway STT.
 * Tap mic to start; words stream into `onText` as chunks complete; tap to stop.
 */
export function useDictation(onText: (value: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const baseTextRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRef.current?.stop();
    mediaRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
  }, []);

  const flushChunk = useCallback(async () => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (blob.size < 100) return;
    const fd = new FormData();
    fd.append("audio", blob, "dictation.webm");
    try {
      const data = await apiUpload<TranscribeResponse>("/api/stt/transcribe", fd);
      const delta = data.transcript.trim();
      if (!delta) return;
      const next =
        baseTextRef.current.length > 0
          ? `${baseTextRef.current} ${delta}`
          : delta;
      baseTextRef.current = next;
      onTextRef.current(next);
      setError(null);
    } catch {
      setError("Dictation failed — check STT availability.");
    }
  }, []);

  const stop = useCallback(async () => {
    setListening(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    await flushChunk();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;
  }, [flushChunk]);

  const start = useCallback(
    async (seedText = "") => {
      setError(null);
      baseTextRef.current = seedText;
      chunksRef.current = [];
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        mediaRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(1000);
        setListening(true);
        timerRef.current = setInterval(() => {
          void flushChunk();
        }, 2500);
      } catch {
        setError("Microphone access denied.");
        cleanup();
      }
    },
    [cleanup, flushChunk],
  );

  const toggle = useCallback(
    (seedText = "") => {
      if (listening) {
        void stop();
      } else {
        void start(seedText);
      }
    },
    [listening, start, stop],
  );

  useEffect(() => () => cleanup(), [cleanup]);

  return { listening, error, toggle, stop, start };
}
