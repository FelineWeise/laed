import { MarkdownContent } from "@/components/MarkdownContent";
import { meBubblePalette, paletteForOtherUser } from "@/lib/bubbleStyles";

type Props = {
  kind: "me" | "them" | "ai" | "anonymous";
  sender?: string | null;
  userId?: string | null;
  time?: string;
  markdown?: boolean;
  replyPreview?: { content: string; sender_label: string } | null;
  onReply?: () => void;
  children: React.ReactNode;
};

function senderInitial(sender: string | null | undefined): string {
  if (!sender) return "?";
  const t = sender.trim();
  return t.length > 0 ? t[0]?.toUpperCase() ?? "?" : "?";
}

function ReplyQuote({
  preview,
}: {
  preview: { content: string; sender_label: string };
}) {
  return (
    <div className="mb-1.5 border-l-2 border-[var(--laed-muted)] pl-2 text-[9px] text-[var(--laed-muted)]">
      <span className="font-medium">{preview.sender_label}</span>
      <div className="line-clamp-2">{preview.content}</div>
    </div>
  );
}

export function ChatBubble({
  kind,
  sender,
  userId,
  time,
  markdown = false,
  replyPreview = null,
  onReply,
  children,
}: Props) {
  const body =
    markdown && typeof children === "string" ? (
      <MarkdownContent content={children} />
    ) : (
      children
    );

  if (kind === "ai") {
    return (
      <div className="mb-3 flex">
        <div className="max-w-[88%]">
          <div
            className="border border-[var(--laed-border)] bg-[var(--laed-bubble-them-0-bg)] px-3 py-2 text-[10px] leading-snug text-[var(--laed-ink)]"
            style={{ borderRadius: "var(--laed-radius-sm)" }}
          >
            <span className="laed-label mb-1 block text-[var(--laed-muted)]">LAED</span>
            {replyPreview ? <ReplyQuote preview={replyPreview} /> : null}
            {body}
          </div>
          {time ? (
            <div className="mt-1 text-[8px] text-[var(--laed-muted)]">{time}</div>
          ) : null}
        </div>
      </div>
    );
  }

  const me = kind === "me";
  const anonymous = kind === "anonymous";
  const palette = me
    ? meBubblePalette
    : paletteForOtherUser(anonymous ? null : (userId ?? null));

  return (
    <div className={`mb-3 flex gap-1.5 ${me ? "flex-row-reverse" : "flex-row"}`}>
      {!me && !anonymous ? (
        <span
          className="mt-5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-medium"
          style={{
            background: palette.background,
            color: palette.color,
            border: palette.border,
          }}
          aria-hidden
        >
          {senderInitial(sender)}
        </span>
      ) : null}
      <div className="max-w-[78%]">
        {sender && !me ? <div className="laed-label mb-1">{sender}</div> : null}
        {anonymous ? <div className="laed-label mb-1">Anonymous</div> : null}
        <div
          className="px-3 py-2 text-[11px] leading-snug"
          style={{
            borderRadius: "var(--laed-radius-sm)",
            background: palette.background,
            color: palette.color,
            border: palette.border,
          }}
        >
          {replyPreview ? <ReplyQuote preview={replyPreview} /> : null}
          {body}
        </div>
        {onReply ? (
          <button
            type="button"
            onClick={onReply}
            className="mt-0.5 border-none bg-transparent p-0 text-[8px] tracking-[1px] text-[var(--laed-muted)] uppercase hover:text-[var(--laed-ink)]"
          >
            Reply
          </button>
        ) : null}
        {time ? (
          <div
            className={`mt-1 text-[8px] text-[var(--laed-muted)] ${me ? "text-right" : "text-left"}`}
          >
            {time}
          </div>
        ) : null}
      </div>
    </div>
  );
}
