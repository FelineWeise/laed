"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { AppShell } from "@/components/AppShell";
import { AssistantPanel } from "@/components/AssistantPanel";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { CanvasInfoTip } from "@/components/CanvasInfoTip";
import { HomeCanvas } from "@/components/HomeCanvas";
import { ProjectGrid } from "@/components/ProjectGrid";
import { useProjectMemberBadges } from "@/lib/hooks/useProjectMemberBadges";
import { apiFetch } from "@/lib/api";
import type { Project } from "@/lib/types";

type HomeView = "canvas" | "list";

export default function GlobalPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<HomeView>("canvas");
  const badgesByNodeId = useProjectMemberBadges(projects, view === "canvas");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<Project[]>("/api/projects");
      setProjects(list);
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
      router.push(`/projects/${project.id}/canvas`);
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
      <AppShell menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)}>
        <div
          className={`laed-page-fill ${menuOpen ? "opacity-35 transition-opacity" : ""}`}
        >
          <div className="flex shrink-0 items-center justify-end gap-2 overflow-visible border-b border-[var(--laed-border)] px-4 py-2">
            <div className="mr-auto flex items-center gap-1.5">
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
              onClick={() => setView("list")}
              className={`laed-nav px-2 py-1 ${view === "list" ? "laed-nav--active" : "laed-nav--inactive"}`}
            >
              List
            </button>
          </div>

          {view === "canvas" ? (
            <HomeCanvas
              projects={projects}
              onOpenProject={(id) => router.push(`/projects/${id}/canvas`)}
              onAddNew={() => setShowCreate(true)}
              badgesByNodeId={badgesByNodeId}
            />
          ) : (
            <ProjectGrid
              projects={projects}
              loading={loading}
              error={error}
              onSelect={(p) => router.push(`/projects/${p.id}/canvas`)}
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
          )}
        </div>

        {showCreate ? (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/20 px-6"
            onClick={() => setShowCreate(false)}
          >
            <form
              className="laed-shell w-full max-w-md border border-[var(--laed-border)] bg-white p-6 shadow-[var(--laed-shadow-pop)]"
              style={{ borderRadius: "var(--laed-radius-sm)" }}
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
                  className="laed-btn-primary flex-1"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <AssistantPanel
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          context="workspace"
        />
        <BottomBar
          assistantOpen={assistantOpen}
          onAssistantToggle={() => setAssistantOpen((o) => !o)}
        />
      </AppShell>
    </AuthGuard>
  );
}
