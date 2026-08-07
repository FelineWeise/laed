import type { MentionSnapshot } from "@/lib/types";

type Props = {
  content: string;
  mentions?: MentionSnapshot[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function MentionHighlightedText({ content, mentions = [] }: Props) {
  const labels = mentions
    .map((m) => m.display_name.trim())
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length);

  if (labels.length === 0) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  const pattern = new RegExp(
    `@(${labels.map(escapeRegExp).join("|")})`,
    "gi",
  );
  const parts = content.split(pattern);

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        const hit = labels.some(
          (label) => label.toLowerCase() === part.toLowerCase(),
        );
        if (i % 2 === 1 && hit) {
          return (
            <span
              key={`${i}-${part}`}
              className="rounded-sm bg-[var(--laed-navy-tint-strong)] px-0.5 font-medium text-[var(--laed-navy)]"
            >
              @{part}
            </span>
          );
        }
        return <span key={`${i}-${part}`}>{part}</span>;
      })}
    </span>
  );
}
