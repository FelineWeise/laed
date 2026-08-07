"use client";

import { EditableSessionTitle } from "@/components/chat/EditableSessionTitle";

type Props = {
  title: string;
  timeLabel: string;
  active: boolean;
  accent?: "default" | "private";
  onClick: () => void;
  onDelete?: () => void;
  onRename?: (title: string) => void;
};

export function ConversationListItem({
  title,
  timeLabel,
  active,
  accent = "default",
  onClick,
  onDelete,
  onRename,
}: Props) {
  const activeBg =
    accent === "private"
      ? "var(--laed-private-bg)"
      : "var(--laed-navy-tint)";

  return (
    <div
      className="group flex items-start gap-1 px-1 py-0.5"
      style={{
        borderRadius: "var(--laed-radius-sm)",
        ...(active ? { background: activeBg } : {}),
      }}
    >
      <div className="min-w-0 flex-1 px-1 py-1.5">
        {onRename ? (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <EditableSessionTitle
              value={title}
              onSave={onRename}
              className="w-full"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="w-full cursor-pointer border-none bg-transparent p-0 text-left"
          >
            <div className="truncate text-[10px] font-medium text-[var(--laed-ink)]">
              {title}
            </div>
          </button>
        )}
        <div className="mt-0.5 text-[8px] text-[var(--laed-muted)]">{timeLabel}</div>
        {onRename ? (
          <button
            type="button"
            onClick={onClick}
            className="mt-1 cursor-pointer border-none bg-transparent p-0 text-[8px] text-[var(--laed-muted)] hover:text-[var(--laed-ink)]"
          >
            Open
          </button>
        ) : null}
      </div>
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
