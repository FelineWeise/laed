"use client";

import Link from "next/link";
import { Camera, MessageCircle, Mic } from "@/components/icons";

type Props = {
  projectId?: string;
  assistantOpen?: boolean;
  onAssistantToggle?: () => void;
};

function btnSmClass() {
  return "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[rgba(26,25,23,0.15)] bg-[rgba(26,25,23,0.06)] text-[var(--laed-ink)]";
}

export function BottomBar({
  projectId,
  assistantOpen = false,
  onAssistantToggle,
}: Props) {
  const spokenHref =
    projectId !== undefined
      ? `/spoken?projectId=${projectId}`
      : "/spoken";
  const cameraHref =
    projectId !== undefined
      ? `/camera?projectId=${projectId}`
      : "/camera";

  return (
    <nav
      className="laed-shell fixed bottom-0 left-0 right-0 z-[150] mx-auto flex items-center justify-center gap-7 border-t border-[var(--laed-border)] bg-[var(--laed-paper)] px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
      aria-label="Primary actions"
    >
      <Link href={spokenHref} className={btnSmClass()} aria-label="Spoken capture">
        <Mic size={17} />
      </Link>
      <button
        type="button"
        onClick={() => onAssistantToggle?.()}
        disabled={onAssistantToggle === undefined}
        className="flex h-[52px] w-[52px] shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-[var(--laed-navy)] shadow-[var(--laed-shadow-fab)]"
        aria-label={assistantOpen ? "Close assistant" : "Open assistant"}
        aria-pressed={assistantOpen}
      >
        <MessageCircle size={22} color="#fff" />
      </button>
      <Link href={cameraHref} className={btnSmClass()} aria-label="Camera capture">
        <Camera size={17} />
      </Link>
    </nav>
  );
}
