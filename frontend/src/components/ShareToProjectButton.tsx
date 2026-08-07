"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ShareToProjectIcon } from "@/components/icons";
import { Tip } from "@/components/Tip";
import type { Project } from "@/lib/types";

type Props = {
  /** Called after a successful attach */
  onAttached?: (projectId: string, projectName: string) => void;
  /** Already linked project id (tints icon) */
  linkedProjectId?: string | null;
  tip?: string;
  className?: string;
  /** Conversation PATCH path builder, or asset id for capture assets */
  mode: "asset" | "conversation";
  assetId?: string;
  conversationId?: string;
  /** Workspace conversation PATCH uses /api/ai/conversations/:id */
  conversationPatchPath?: string;
};

export function ShareToProjectButton({
  onAttached,
  linkedProjectId = null,
  tip = "Add to a project — stays private to you",
  className = "",
  mode,
  assetId,
  conversationId,
  conversationPatchPath,
}: Props) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void apiFetch<Project[]>("/api/projects").then(setProjects);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function attach(project: Project) {
    setBusy(true);
    try {
      if (mode === "asset" && assetId) {
        await apiFetch(`/api/capture/assets/${assetId}`, {
          method: "PATCH",
          body: JSON.stringify({ project_id: project.id, is_private: true }),
        });
      } else if (mode === "conversation" && conversationId) {
        const path =
          conversationPatchPath ??
          `/api/ai/conversations/${conversationId}`;
        await apiFetch(path, {
          method: "PATCH",
          body: JSON.stringify({
            project_id: project.id,
            is_private: true,
          }),
        });
      }
      setToast(`Added privately to ${project.name}`);
      onAttached?.(project.id, project.name);
      setOpen(false);
      setTimeout(() => setToast(null), 2200);
    } finally {
      setBusy(false);
    }
  }

  const linked = Boolean(linkedProjectId);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`.trim()}>
      <Tip tip={linked ? "In a project (private). Release in Project Room." : tip}>
        <button
          type="button"
          aria-label="Add to project"
          disabled={busy}
          onClick={() => setOpen((o) => !o)}
          className="flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent p-0"
          style={{
            color: linked
              ? "var(--laed-private-accent)"
              : "var(--laed-text-faint)",
            cursor: "pointer",
          }}
        >
          <ShareToProjectIcon size={14} />
        </button>
      </Tip>
      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+4px)] z-[90] min-w-[11rem] rounded-[10px] border border-[var(--laed-border)] bg-white p-1.5 shadow-[var(--laed-shadow-pop)]"
          role="menu"
        >
          <p className="px-2 py-1 text-[8px] font-semibold tracking-[1px] text-[var(--laed-muted)] uppercase">
            Add to project
          </p>
          {projects.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-[var(--laed-muted)]">
              No projects yet
            </p>
          ) : (
            projects.map((p) => (
              <Tip
                key={p.id}
                tip="Joins as private to you. Release visibility later in Project Room."
                placement="below"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => void attach(p)}
                  className="w-full cursor-pointer rounded-md border-none bg-transparent px-2.5 py-2 text-left text-[11px] text-[var(--laed-ink)] hover:bg-[var(--laed-private-bg)] hover:text-[var(--laed-private-accent)]"
                >
                  {p.name}
                </button>
              </Tip>
            ))
          )}
        </div>
      ) : null}
      {toast ? (
        <span className="pointer-events-none absolute -bottom-8 left-1/2 z-[95] -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--laed-ink)] px-3 py-1.5 text-[9px] text-white">
          {toast}
        </span>
      ) : null}
    </div>
  );
}
