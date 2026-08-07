"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { CanvasInfoTip } from "@/components/CanvasInfoTip";
import { HomeCanvas } from "@/components/HomeCanvas";
import { IncomingInvitations } from "@/components/IncomingInvitations";
import { ProjectGrid } from "@/components/ProjectGrid";
import { useProjectMemberBadges } from "@/lib/hooks/useProjectMemberBadges";
import { apiFetch } from "@/lib/api";
import type { Member, Project } from "@/lib/types";

type HomeView = "list" | "canvas" | "manage";

const STATUS_COL = {
  done: "#2D6A4F",
  pending: "#1B4332",
  warn: "#B0483A",
  neutral: "#8A8780",
} as const;

type ProjectRowMeta = {
  partnerCount: number;
  stage: string;
  flag: { text: string; kind: keyof typeof STATUS_COL } | null;
};

function ProjectRow({
  project,
  meta,
  onClick,
}: {
  project: Project;
  meta: ProjectRowMeta;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer flex-col items-center border-none bg-transparent px-1.5 py-4 font-[inherit]"
    >
      <div className="text-[18px] font-semibold tracking-[0.3px] text-[var(--laed-ink)] uppercase">
        {project.name}
      </div>
      <div className="mt-1 whitespace-nowrap text-[11px] text-[var(--laed-muted)]">
        {meta.stage} · {meta.partnerCount}{" "}
        {meta.partnerCount === 1 ? "partner" : "partners"}
      </div>
      {meta.flag ? (
        <div className="mt-1 inline-flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: STATUS_COL[meta.flag.kind] }}
          />
          <span
            className="text-[11px] font-medium"
            style={{ color: STATUS_COL[meta.flag.kind] }}
          >
            {meta.flag.text}
          </span>
        </div>
      ) : null}
    </button>
  );
}

export default function GlobalPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [metaById, setMetaById] = useState<Record<string, ProjectRowMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<HomeView>("list");
  const badgesByNodeId = useProjectMemberBadges(projects, view === "canvas");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<Project[]>("/api/projects");
      setProjects(list);
      const entries = await Promise.all(
        list.map(async (p) => {
          try {
            const members = await apiFetch<Member[]>(
              `/api/projects/${p.id}/members`,
            );
            const partnerCount = members.length;
            const stage = p.archived_at ? "Archived" : "In progress";
            return [
              p.id,
              {
                partnerCount,
                stage,
                flag: null,
              } satisfies ProjectRowMeta,
            ] as const;
          } catch {
            return [
              p.id,
              {
                partnerCount: 0,
                stage: "In progress",
                flag: null,
              } satisfies ProjectRowMeta,
            ] as const;
          }
        }),
      );
      setMetaById(Object.fromEntries(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name === "") return;
    setCreating(true);
    setError(null);
    try {
      const project = await apiFetch<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setShowCreate(false);
      setNewName("");
      router.push(`/projects/${project.id}/room`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function updateProjectTags(projectId: string, tags: string[]) {
    const updated = await apiFetch<Project>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ tags }),
    });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
  }

  return (
    <AuthGuard>
      <AppShell
        section="Projects"
        onHome={() => {
          setView("list");
          router.push("/global");
        }}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((o) => !o)}
        chrome="private"
      >
        <div
          className={`laed-page-fill ${menuOpen ? "opacity-35 transition-opacity" : ""}`}
        >
          <div className="flex shrink-0 items-center justify-end gap-2 overflow-visible border-b border-[rgba(26,25,23,0.07)] px-4 py-2">
            <div className="mr-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`laed-nav px-2 py-1 ${view === "list" ? "laed-nav--active" : "laed-nav--inactive"}`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setView("canvas")}
                className={`laed-nav px-2 py-1 ${view === "canvas" ? "laed-nav--active" : "laed-nav--inactive"}`}
              >
                Canvas
              </button>
              {view === "canvas" ? <CanvasInfoTip /> : null}
            </div>
            <button
              type="button"
              onClick={() => setView("manage")}
              className={`laed-nav px-2 py-1 ${view === "manage" ? "laed-nav--active" : "laed-nav--inactive"}`}
            >
              Manage
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="laed-nav px-2 py-1 text-[var(--laed-private-accent)]"
            >
              + New
            </button>
          </div>

          <IncomingInvitations onAccepted={() => void loadProjects()} />

          {view === "list" ? (
            <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4">
              {loading ? (
                <p className="text-center text-[11px] text-[var(--laed-muted)]">
                  Loading…
                </p>
              ) : null}
              {error ? (
                <p className="text-center text-[11px] text-[var(--laed-warn)]">
                  {error}
                </p>
              ) : null}
              {!loading && projects.length === 0 ? (
                <p className="text-center text-[11px] text-[var(--laed-muted)]">
                  No projects yet. Create one to begin.
                </p>
              ) : null}
              <div className="flex flex-col">
                {projects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    meta={
                      metaById[p.id] ?? {
                        partnerCount: 0,
                        stage: "In progress",
                        flag: null,
                      }
                    }
                    onClick={() => router.push(`/projects/${p.id}/room`)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {view === "canvas" ? (
            <HomeCanvas
              projects={projects}
              onOpenProject={(id) => router.push(`/projects/${id}/room`)}
              onAddNew={() => setShowCreate(true)}
              badgesByNodeId={badgesByNodeId}
            />
          ) : null}

          {view === "manage" ? (
            <ProjectGrid
              projects={projects}
              loading={loading}
              error={error}
              onSelect={(p) => router.push(`/projects/${p.id}/room`)}
              onAddNew={() => setShowCreate(true)}
              onTagsChange={updateProjectTags}
              onArchived={(id) =>
                setProjects((prev) => prev.filter((p) => p.id !== id))
              }
              onDeleted={(id) =>
                setProjects((prev) => prev.filter((p) => p.id !== id))
              }
              onReload={loadProjects}
            />
          ) : null}
        </div>

        {showCreate ? (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/20 px-6"
            onClick={() => setShowCreate(false)}
          >
            <form
              className="laed-shell w-full max-w-md border border-[var(--laed-border)] bg-white p-6 shadow-[var(--laed-shadow-pop)]"
              style={{ borderRadius: "var(--laed-radius-card)" }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => void handleCreate(e)}
            >
              <p className="laed-label mb-4">New project</p>
              <label className="block">
                <span className="laed-label mb-1 block">Name</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="laed-input"
                  placeholder="Project name"
                  autoFocus
                  required
                />
              </label>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  className="laed-label flex-1 cursor-pointer border border-[var(--laed-border)] bg-transparent py-2.5"
                  style={{ borderRadius: "var(--laed-radius-sm)" }}
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || newName.trim() === ""}
                  className="laed-btn-private flex-1"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomBar variant="private" />
      </AppShell>
    </AuthGuard>
  );
}
