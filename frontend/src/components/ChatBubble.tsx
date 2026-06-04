type Props = {
  kind: "me" | "them" | "ai";
  sender?: string | null;
  time?: string;
  children: React.ReactNode;
};

export function ChatBubble({ kind, sender, time, children }: Props) {
  if (kind === "ai") {
    return (
      <div className="mb-3 flex">
        <div className="max-w-[88%]">
          <div
            className="border border-[var(--laed-border)] bg-[var(--laed-paper)] px-3 py-2 text-[10px] leading-snug text-[var(--laed-muted)]"
            style={{ borderRadius: "var(--laed-radius-sm)" }}
          >
            <span className="laed-label mb-1 block text-[var(--laed-border)]">
              AI
            </span>
            {children}
          </div>
          {time ? (
            <div className="mt-1 text-[8px] text-[var(--laed-border)]">{time}</div>
          ) : null}
        </div>
      </div>
    );
  }

  const me = kind === "me";
  return (
    <div className={`mb-3 flex ${me ? "flex-row-reverse" : "flex-row"}`}>
      <div className="max-w-[78%]">
        {sender ? (
          <div className="laed-label mb-1">{sender}</div>
        ) : null}
        <div
          className="px-3 py-2 text-[11px] leading-snug"
          style={{
            borderRadius: "var(--laed-radius-sm)",
            background: me ? "var(--laed-ink)" : "#fff",
            color: me ? "#fff" : "var(--laed-ink)",
            border: me ? "none" : "1px solid var(--laed-border)",
          }}
        >
          {children}
        </div>
        {time ? (
          <div
            className={`mt-1 text-[8px] text-[var(--laed-border)] ${me ? "text-right" : "text-left"}`}
          >
            {time}
          </div>
        ) : null}
      </div>
    </div>
  );
}
