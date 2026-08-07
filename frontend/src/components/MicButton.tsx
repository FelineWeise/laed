"use client";

import { Mic } from "@/components/icons";

type Props = {
  listening: boolean;
  onClick: () => void;
  size?: number;
  title?: string;
  /** Private surfaces use green; project contexts keep navy */
  accent?: "private" | "project";
};

export function MicButton({
  listening,
  onClick,
  size = 38,
  title,
  accent = "project",
}: Props) {
  const activeBg =
    accent === "private"
      ? "var(--laed-private-accent)"
      : "var(--laed-navy)";
  const halo =
    accent === "private"
      ? "0 0 0 5px var(--laed-private-tint-strong)"
      : "0 0 0 5px var(--laed-navy-tint-strong)";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (listening ? "Stop dictation" : "Dictate")}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      aria-pressed={listening}
      className="flex shrink-0 items-center justify-center border-none transition-[background,box-shadow] duration-200"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: listening ? activeBg : "var(--laed-fill-06)",
        color: listening ? "#fff" : "var(--laed-muted)",
        boxShadow: listening ? halo : "none",
        cursor: "pointer",
      }}
    >
      {listening ? (
        <span className="flex h-4 items-center gap-[2.5px]">
          {[8, 14, 10, 15, 7].map((h, i) => (
            <span
              key={i}
              className="w-0.5 rounded-sm bg-white"
              style={{
                height: h,
                animation: `laedwave 0.7s ${i * 0.09}s infinite ease-in-out`,
              }}
            />
          ))}
        </span>
      ) : (
        <Mic size={16} />
      )}
    </button>
  );
}
