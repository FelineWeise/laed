"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TIP_TEXT =
  "Drag project bubbles to reposition. Tag projects from List view. Turn on “Group by tags” to cluster similar projects (layout is not saved).";

const TIP_WIDTH = 224;
const VIEWPORT_PAD = 12;

export function CanvasInfoTip() {
  const [open, setOpen] = useState(false);
  const [tipStyle, setTipStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || buttonRef.current === null) {
      setTipStyle(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    let left = rect.left;
    if (left + TIP_WIDTH > window.innerWidth - VIEWPORT_PAD) {
      left = window.innerWidth - TIP_WIDTH - VIEWPORT_PAD;
    }
    if (left < VIEWPORT_PAD) {
      left = VIEWPORT_PAD;
    }
    setTipStyle({
      top: rect.bottom + 6,
      left,
      width: TIP_WIDTH,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const tip =
    open && tipStyle !== null ? (
      <div
        className="fixed z-[400] border border-[var(--laed-border)] bg-white p-2.5 text-[9px] leading-snug text-[var(--laed-muted)] shadow-[var(--laed-shadow-pop)]"
        style={{
          top: tipStyle.top,
          left: tipStyle.left,
          width: tipStyle.width,
          borderRadius: "var(--laed-radius-sm)",
        }}
        role="tooltip"
      >
        {TIP_TEXT}
      </div>
    ) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--laed-border)] bg-white text-[10px] font-medium text-[var(--laed-muted)]"
        aria-label="Canvas help"
        aria-expanded={open}
      >
        i
      </button>
      {typeof document !== "undefined" && tip !== null
        ? createPortal(tip, document.body)
        : null}
    </div>
  );
}
