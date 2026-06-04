"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Mic, Phone } from "@/components/icons";

type Props = {
  projectId?: string;
};

function btnSmClass() {
  return "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[rgba(26,25,23,0.15)] bg-[rgba(26,25,23,0.06)] text-[var(--laed-ink)]";
}

export function BottomBar({ projectId }: Props) {
  const router = useRouter();
  const recordHref =
    projectId !== undefined
      ? `/record?projectId=${projectId}`
      : "/record";
  const roomHref =
    projectId !== undefined
      ? `/projects/${projectId}/room`
      : "/global";

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-[150] flex w-full max-w-[390px] -translate-x-1/2 items-center justify-center gap-7 border-t border-[var(--laed-border)] bg-[var(--laed-paper)] px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
      aria-label="Primary actions"
    >
      <Link href="/ai" className={btnSmClass()} aria-label="AI voice">
        <Mic size={17} />
      </Link>
      <button
        type="button"
        onClick={() => router.push(roomHref)}
        className="flex h-[52px] w-[52px] shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-[var(--laed-navy)] shadow-[var(--laed-shadow-fab)]"
        aria-label="Open room"
      >
        <Phone size={22} color="#fff" />
      </button>
      <Link href={recordHref} className={btnSmClass()} aria-label="Record">
        <Camera size={17} />
      </Link>
    </nav>
  );
}
