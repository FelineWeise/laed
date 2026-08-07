"use client";

import { useEffect, useState } from "react";
import { IncomingInvitations } from "@/components/IncomingInvitations";
import { ProjectListCard } from "@/components/ProjectListCard";
import { apiFetch } from "@/lib/api";
import type { Project } from "@/lib/types";

type Props = {
  projects: Project[];
  loading: boolean;
  error: string | null;
  onSelect: (project: Project) => void;
  onAddNew: () => void;
  onTagsChange?: (projectId: string, tags: string[]) => void | Promise<void>;
  onArchived?: (projectId: string) => void;
  onDeleted?: (projectId: string) => void;
  onReload?: () => void;
};

export function ProjectGrid({
  projects,
  loading,
  error,
  onSelect,
  onAddNew,
  onTagsChange,
  onArchived,
  onDeleted,
  onReload,
}: Props) {
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ id: string }>("/api/auth/me").then((u) => setMyUserId(u.id));
  }, []);

  if (loading) {
    return <p className="laed-label p-4 md:p-6">Loading…</p>;
  }

  if (error !== null) {
    return <p className="p-4 text-[10px] text-red-700 md:p-6">{error}</p>;
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center md:py-24">
        <p className="laed-label mb-2">Projects</p>
        <p className="max-w-sm text-[11px] leading-relaxed text-[var(--laed-muted)]">
          No projects yet. Create one to open a project canvas and start
          collaborating.
        </p>
        <button type="button" onClick={onAddNew} className="laed-btn-private mt-8">
          Add new project
        </button>
      </div>
    );
  }

  return (
    <div className="laed-tab-scroll px-4 pt-2 md:px-6 md:pt-4">
      <IncomingInvitations onAccepted={() => onReload?.()} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="laed-label">Your projects</p>
        <button
          type="button"
          onClick={onAddNew}
          className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-private-accent)]"
        >
          + New
        </button>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectListCard
            key={project.id}
            project={project}
            myUserId={myUserId}
            onSelect={() => onSelect(project)}
            onTagsChange={(tags) => onTagsChange?.(project.id, tags) ?? Promise.resolve()}
            onArchived={() => onArchived?.(project.id)}
            onDeleted={() => onDeleted?.(project.id)}
          />
        ))}
      </ul>
    </div>
  );
}
