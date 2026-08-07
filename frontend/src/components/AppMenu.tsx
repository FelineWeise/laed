"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArtifactIcon,
  GearIcon,
  GridIcon,
  PersonIcon,
} from "@/components/icons";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useMentionsInbox } from "@/lib/hooks/useMentionsInbox";
import type { InboxMention, Project } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate?: () => void;
};

const MENU_ITEMS: { label: string; icon: React.ReactNode; href?: string }[] = [
  { label: "Projects", icon: <GridIcon />, href: "/global" },
  { label: "Agent", icon: <ArtifactIcon />, href: "/laed" },
  { label: "Capture", icon: <ArtifactIcon />, href: "/capture" },
  { label: "Workbench", icon: <ArtifactIcon />, href: "/workbench" },
  { label: "Contacts", icon: <PersonIcon /> },
  { label: "Settings", icon: <GearIcon /> },
];

function mentionRoomHref(m: InboxMention): string {
  const params = new URLSearchParams({ tab: "thread" });
  if (m.topic_node_id) params.set("topicId", m.topic_node_id);
  if (m.thread_session_id) params.set("threadSessionId", m.thread_session_id);
  return `/projects/${m.project_id}/room?${params.toString()}`;
}

export function AppMenu({ open, onClose, onNavigate }: Props) {
  const clear = useAuthStore((s) => s.clear);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const { items: mentions, unreadCount, markRead, refresh } = useMentionsInbox(open);

  useEffect(() => {
    if (!open) return;
    void apiFetch<Project[]>("/api/projects").then(setProjects).catch(() => {});
    void refresh().catch(() => undefined);
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] bg-black/20" onClick={onClose}>
      <div
        className="laed-popup-surface absolute top-[90px] right-[18px] w-44 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {MENU_ITEMS.map((item, i) => (
          <div key={item.label}>
            {item.href ? (
              <Link
                href={item.href}
                onClick={() => {
                  onClose();
                  onNavigate?.();
                }}
                className="laed-nav laed-nav--active flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 hover:bg-[var(--laed-paper)]"
                style={{
                  borderBottom:
                    i < MENU_ITEMS.length - 1
                      ? "1px solid var(--laed-paper)"
                      : "none",
                }}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center opacity-40">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ) : (
              <div
                className="laed-nav laed-nav--inactive flex items-center gap-2.5 px-3.5 py-2.5"
                style={{
                  borderBottom:
                    i < MENU_ITEMS.length - 1
                      ? "1px solid var(--laed-paper)"
                      : "none",
                }}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center opacity-40">
                  {item.icon}
                </span>
                {item.label}
              </div>
            )}
          </div>
        ))}
        <div className="border-t border-[var(--laed-paper)] px-3.5 py-2">
          <p className="laed-label mb-1 flex items-center justify-between">
            <span>Mentions</span>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-[var(--laed-private-accent)] px-1.5 py-0.5 text-[8px] text-white normal-case tracking-normal">
                {unreadCount}
              </span>
            ) : null}
          </p>
          {mentions.length === 0 ? (
            <p className="text-[9px] text-[var(--laed-muted)]">No mentions yet</p>
          ) : (
            <ul className="max-h-32 overflow-y-auto">
              {mentions.slice(0, 8).map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full py-1 text-left text-[10px] hover:text-[var(--laed-private-accent)]"
                    onClick={() => {
                      void markRead(m.id).then(() => {
                        onClose();
                        onNavigate?.();
                        router.push(mentionRoomHref(m));
                      });
                    }}
                  >
                    <span
                      className={
                        m.read_at === null ? "font-medium text-[var(--laed-ink)]" : ""
                      }
                    >
                      {m.sender_label} · {m.project_name}
                    </span>
                    <span className="block line-clamp-1 text-[9px] text-[var(--laed-muted)]">
                      {m.excerpt}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {projects.length > 0 ? (
          <div className="border-t border-[var(--laed-paper)] px-3.5 py-2">
            <p className="laed-label mb-1">Your projects</p>
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}/room`}
                onClick={() => {
                  onClose();
                  onNavigate?.();
                }}
                className="block py-1 text-[10px] text-[var(--laed-ink)]"
              >
                {p.name}
              </Link>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="w-full border-t border-[var(--laed-paper)] px-3.5 py-2.5 text-left text-[10px] tracking-[1.5px] text-red-700 uppercase"
          onClick={() => {
            clear();
            onClose();
            window.location.href = "/login";
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
