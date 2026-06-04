"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArchiveIcon,
  ArtifactIcon,
  GearIcon,
  GridIcon,
  PersonIcon,
} from "@/components/icons";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { Project } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate?: () => void;
};

const MENU_ITEMS: { label: string; icon: React.ReactNode; href?: string }[] = [
  { label: "Projects", icon: <GridIcon />, href: "/global" },
  { label: "Artifacts", icon: <ArtifactIcon /> },
  { label: "Archive", icon: <ArchiveIcon /> },
  { label: "Contacts", icon: <PersonIcon /> },
  { label: "Settings", icon: <GearIcon /> },
];

export function AppMenu({ open, onClose, onNavigate }: Props) {
  const clear = useAuthStore((s) => s.clear);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!open) return;
    void apiFetch<Project[]>("/api/projects").then(setProjects).catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] bg-black/20" onClick={onClose}>
      <div
        className="absolute top-[90px] right-[18px] w-40 border border-[var(--laed-border)] bg-white shadow-[var(--laed-shadow-pop)]"
        style={{ borderRadius: "var(--laed-radius-sm)" }}
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
                className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-[10px] tracking-[1.5px] text-[var(--laed-ink)] uppercase hover:bg-[var(--laed-paper)]"
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
                className="flex items-center gap-2.5 px-3.5 py-2.5 text-[10px] tracking-[1.5px] text-[var(--laed-muted)] uppercase"
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
        {projects.length > 0 ? (
          <div className="border-t border-[var(--laed-paper)] px-3.5 py-2">
            <p className="laed-label mb-1">Your projects</p>
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}/canvas`}
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
