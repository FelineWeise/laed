import { MarkdownContent } from "@/components/MarkdownContent";
import {
  meBubblePalette,
  paletteForOtherUser,
  privateAiBubblePalette,
  privateMeBubblePalette,
} from "@/lib/bubbleStyles";

type Props = {
  kind: "me" | "them" | "ai" | "anonymous";
  sender?: string | null;
  userId?: string | null;
  time?: string;
  markdown?: boolean;
  privateSpace?: boolean;
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
  privateSpace = false,
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
    const aiPalette = privateSpace ? privateAiBubblePalette : null;
    return (
      <div className="mb-3 flex">
        <div className="max-w-[88%]">
          <div
            className="px-[13px] py-2.5 text-[11px] leading-snug text-[var(--laed-ink)]"
            style={{
              borderRadius: 16,
              background: aiPalette?.background ?? "var(--laed-bubble-ai-bg)",
              color: aiPalette?.color,
              border: aiPalette?.border ?? "none",
            }}
          >
            <span
              className="mb-1 block text-[9px] font-semibold tracking-[0.5px]"
              style={{
                color: privateSpace
                  ? "var(--laed-muted)"
                  : "var(--laed-green)",
              }}
            >
              {privateSpace ? "LAED" : "AI"}
            </span>
            {replyPreview ? <ReplyQuote preview={replyPreview} /> : null}
            {body}
          </div>
          {time ? (
            <div className="mt-1 px-0.5 text-[9px] text-[rgba(26,25,23,0.3)]">
              {time}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const me = kind === "me";
  const anonymous = kind === "anonymous";
  const palette = me
    ? privateSpace
      ? privateMeBubblePalette
      : meBubblePalette
    : anonymous || privateSpace
      ? paletteForOtherUser(anonymous ? null : (userId ?? null))
      : {
          background: "#fff",
          color: "var(--laed-ink)",
          border: "none",
        };

  return (
    <div className={`mb-3 flex gap-1.5 ${me ? "flex-row-reverse" : "flex-row"}`}>
      {!me && !anonymous && privateSpace ? (
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
      <div className="max-w-[80%]">
        {sender && !me ? (
          <div className="mb-1 px-0.5 text-[10.5px] font-medium text-[var(--laed-muted)]">
            {sender}
          </div>
        ) : null}
        {anonymous ? (
          <div className="mb-1 px-0.5 text-[10.5px] font-medium text-[var(--laed-muted)]">
            Anonymous
          </div>
        ) : null}
        <div
          className="px-3.5 py-2.5 text-[12px] leading-snug"
          style={{
            borderRadius: 16,
            background: palette.background,
            color: palette.color,
            border: palette.border,
            boxShadow:
              me || privateSpace
                ? "none"
                : "0 1px 2px rgba(26,25,23,0.05), 0 4px 14px rgba(26,25,23,0.05)",
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
