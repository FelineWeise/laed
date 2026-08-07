"use client";

import Link from "next/link";
import { CaptureGlyph, Sparkle } from "@/components/icons";

type Props = {
  projectId?: string;
  agentActive?: boolean;
  captureActive?: boolean;
  variant?: "private" | "project";
};

export function BottomBar({
  projectId,
  agentActive = false,
  captureActive = false,
  variant = "private",
}: Props) {
  const captureHref =
    projectId !== undefined
      ? `/capture?projectId=${projectId}`
      : "/capture";

  const isPrivate = variant === "private";

  const barBg = isPrivate
    ? "rgba(27, 67, 50, 0.08)"
    : "rgba(29, 58, 87, 0.1)";
  const inactiveBg = isPrivate
    ? "rgba(27, 67, 50, 0.12)"
    : "rgba(29, 58, 87, 0.12)";
  const agentActiveBg = isPrivate ? "var(--laed-private-accent)" : "var(--laed-navy)";
  const captureActiveBg = isPrivate ? "var(--laed-private-accent)" : "var(--laed-navy)";
  const agentShadow = isPrivate
    ? "var(--laed-shadow-fab-private)"
    : "0 4px 16px rgba(29, 58, 87, 0.28)";

  return (
    <nav
      className="laed-shell fixed bottom-0 left-0 right-0 z-[150] mx-auto flex items-center justify-center gap-[34px] pb-[max(18px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md"
      style={{
        background: barBg,
        height: "var(--laed-bottom-bar-height)",
      }}
      aria-label="Primary actions"
    >
      <Link
        href="/laed"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-none"
        style={{
          background: agentActive ? agentActiveBg : inactiveBg,
          color: agentActive ? "#fff" : "var(--laed-ink)",
          boxShadow: agentActive ? agentShadow : undefined,
        }}
        aria-label="Agent"
        aria-current={agentActive ? "page" : undefined}
      >
        <Sparkle size={19} color={agentActive ? "#fff" : undefined} />
      </Link>
      <Link
        href={captureHref}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-none"
        style={{
          background: captureActive ? captureActiveBg : inactiveBg,
          color: captureActive ? "#fff" : "var(--laed-ink)",
          boxShadow: captureActive ? agentShadow : undefined,
        }}
        aria-label="Capture"
        aria-current={captureActive ? "page" : undefined}
      >
        <CaptureGlyph size={20} color={captureActive ? "#fff" : undefined} />
      </Link>
    </nav>
  );
}
