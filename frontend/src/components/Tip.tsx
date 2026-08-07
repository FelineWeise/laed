"use client";

import type { ReactNode } from "react";

type Props = {
  tip: string;
  children: ReactNode;
  className?: string;
  /** Prefer tip below the control (e.g. near top of viewport) */
  placement?: "above" | "below";
};

/** Hover/focus tooltip — keep instructional copy out of permanent UI. */
export function Tip({ tip, children, className = "", placement = "above" }: Props) {
  if (!tip) {
    return <span className={className}>{children}</span>;
  }
  return (
    <span
      className={`laed-tip ${placement === "below" ? "laed-tip--below" : ""} ${className}`.trim()}
      data-tip={tip}
    >
      {children}
    </span>
  );
}
