"use client";

import { useEffect, useState } from "react";
import { ConversationListItem } from "@/components/chat/ConversationListItem";
import { useIsNarrowViewport } from "@/lib/hooks/useMediaQuery";

export type DrawerItem = {
  id: string;
  title: string;
  timeLabel: string;
};

type Props = {
  open: boolean;
  onToggle: () => void;
  items: DrawerItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  loading?: boolean;
  newButtonLabel?: string;
  accent?: "default" | "private";
  /** Borderless layout for popups; separation via spacing only */
  soft?: boolean;
  deleteConfirmMessage?: string;
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function drawerTimeFromIso(iso: string): string {
  return formatRelative(iso);
}

export function ConversationDrawer({
  open,
  onToggle,
  items,
  selectedId,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  loading = false,
  newButtonLabel = "New chat",
  accent = "default",
  soft = false,
  deleteConfirmMessage = "Remove this item from history?",
}: Props) {
  const isPrivateAccent = accent === "private";
  const isNarrow = useIsNarrowViewport();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isNarrow) setMobileOpen(false);
  }, [isNarrow]);

  const showPanel = isNarrow ? mobileOpen : open;

  function confirmDelete(id: string, title: string) {
    if (!onDelete) return;
    if (window.confirm(`${deleteConfirmMessage}\n\n"${title}"`)) {
      void onDelete(id);
    }
  }

  const panelBg = "var(--laed-paper)";
  const asideBorder = soft ? "" : "border-r border-[var(--laed-border)]";
  const headerBorder = soft ? "" : "border-b border-[var(--laed-border)]";

  const panel = (
    <aside
      className={
        isNarrow
          ? `fixed inset-y-0 left-0 z-[180] flex w-[min(280px,88vw)] flex-col shadow-[var(--laed-shadow-pop)] rounded-r-[var(--laed-radius-md)] ${asideBorder}`
          : `flex h-full w-[min(200px,30vw)] shrink-0 flex-col ${asideBorder}`
      }
      style={{
        background: panelBg,
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        borderRadius: soft && !isNarrow ? 0 : undefined,
      }}
    >
      <div
        className={`flex shrink-0 items-center justify-between gap-2 px-3 py-3 ${headerBorder}`}
      >
        <button
          type="button"
          onClick={() => void onNewChat()}
          className={
            isPrivateAccent
              ? "laed-btn-private cursor-pointer px-2 py-1"
              : "laed-label cursor-pointer border border-[var(--laed-border)] bg-[var(--laed-paper-elevated)] px-2.5 py-1.5 text-[var(--laed-navy)]"
          }
          style={{ borderRadius: "var(--laed-radius-sm)" }}
        >
          {newButtonLabel}
        </button>
        {isNarrow ? (
          <button
            type="button"
            className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-muted)]"
            onClick={() => setMobileOpen(false)}
          >
            Close
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-muted)]"
            aria-label={open ? "Hide history" : "Show history"}
          >
            {open ? "◀" : "▶"}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {loading ? (
          <p className="px-2 py-2 text-[9px] text-[var(--laed-muted)]">Loading…</p>
        ) : null}
        {items.map((item) => (
          <ConversationListItem
            key={item.id}
            title={item.title}
            timeLabel={item.timeLabel}
            active={item.id === selectedId}
            accent={accent}
            onClick={() => {
              onSelect(item.id);
              setMobileOpen(false);
            }}
            onDelete={
              onDelete
                ? () => confirmDelete(item.id, item.title)
                : undefined
            }
            onRename={
              onRename ? (title) => onRename(item.id, title) : undefined
            }
          />
        ))}
      </div>
    </aside>
  );

  if (isNarrow) {
    return (
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="laed-label cursor-pointer border-none bg-transparent px-2 py-2 text-[var(--laed-muted)]"
          aria-expanded={mobileOpen}
        >
          History
        </button>
        {showPanel ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[170] cursor-default border-none bg-black/25"
              aria-label="Close history"
              onClick={() => setMobileOpen(false)}
            />
            {panel}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full shrink-0">
      {!open ? (
        <button
          type="button"
          onClick={onToggle}
          className="laed-label flex shrink-0 cursor-pointer flex-col border-none bg-transparent px-1 py-3 text-[var(--laed-muted)]"
          aria-label="Show history"
        >
          ▶
        </button>
      ) : null}
      {showPanel ? panel : null}
    </div>
  );
}
