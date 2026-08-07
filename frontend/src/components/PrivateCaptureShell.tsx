"use client";

import { AppShell } from "@/components/AppShell";
import { BottomBar } from "@/components/BottomBar";
import type { ReactNode } from "react";

type Props = {
  title: string;
  sessionTitle?: string;
  onBack: () => void;
  recording?: boolean;
  /** Optional left chrome; omit for Concept C full-bleed. */
  sidebar?: ReactNode;
  children: ReactNode;
};

export function PrivateCaptureShell({
  title,
  sessionTitle,
  onBack,
  recording = false,
  sidebar,
  children,
}: Props) {
  return (
    <AppShell section={title} onHome={onBack} chrome="private">
      <div className="laed-viewport-fill flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 px-[var(--laed-viewport-pad-x)] py-2">
          <h1 className="text-[10px] font-semibold tracking-[1px] uppercase">
            {sessionTitle ?? title}
          </h1>
          {recording ? (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.6px] text-[var(--laed-warn)] uppercase">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--laed-warn)]"
                style={{ animation: "laedpulse 1s infinite" }}
              />
              Recording
            </span>
          ) : null}
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {sidebar}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
      <BottomBar variant="private" captureActive />
    </AppShell>
  );
}
