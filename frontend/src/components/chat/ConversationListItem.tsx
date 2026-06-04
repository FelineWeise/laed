"use client";

type Props = {
  title: string;
  timeLabel: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
};

export function ConversationListItem({
  title,
  timeLabel,
  active,
  onClick,
  onDelete,
}: Props) {
  return (
    <div
      className={`group flex items-start gap-1 px-1 py-0.5 ${
        active ? "bg-[rgba(29,58,87,0.08)]" : ""
      }`}
      style={{ borderRadius: "var(--laed-radius-sm)" }}
    >
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 cursor-pointer border-none bg-transparent px-1 py-1.5 text-left"
      >
        <div className="truncate text-[10px] font-medium text-[var(--laed-ink)]">
          {title}
        </div>
        <div className="mt-0.5 text-[8px] text-[var(--laed-muted)]">{timeLabel}</div>
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="mt-1 shrink-0 cursor-pointer border-none bg-transparent px-1 text-[10px] text-[var(--laed-muted)] opacity-0 group-hover:opacity-100 hover:text-red-700"
          aria-label={`Delete ${title}`}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
