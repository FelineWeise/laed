"use client";

import { useCallback, useEffect, useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { apiFetch } from "@/lib/api";
import type { Project } from "@/lib/types";

type HarnessDoc = {
  id: string;
  slug: string;
  filename: string;
  content: string;
  project_id: string | null;
};

const SLUGS = ["agent", "soul"] as const;

export default function WorkbenchPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<"global" | "project">("global");
  const [projectId, setProjectId] = useState("");
  const [slug, setSlug] = useState<(typeof SLUGS)[number]>("agent");
  const [docId, setDocId] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const listPath =
    scope === "global"
      ? "/api/harness/documents"
      : `/api/projects/${projectId}/harness/documents`;

  const loadDoc = useCallback(async () => {
    if (scope === "project" && projectId === "") return;
    setStatus(null);
    try {
      const docs = await apiFetch<HarnessDoc[]>(listPath);
      const row = docs.find((d) => d.slug === slug);
      if (row) {
        setDocId(row.id);
        setContent(row.content);
        return;
      }
      setDocId("");
      setContent("");
    } catch {
      setDocId("");
      setContent("");
    }
  }, [listPath, slug, scope, projectId]);

  useEffect(() => {
    void apiFetch<Project[]>("/api/projects").then((list) => {
      setProjects(list);
      const first = list[0];
      if (first !== undefined && projectId === "") setProjectId(first.id);
    });
  }, [projectId]);

  useEffect(() => {
    void loadDoc();
  }, [loadDoc]);

  async function handleSave() {
    if (scope === "project" && projectId === "") return;
    setStatus(null);
    try {
      if (docId === "") {
        const created = await apiFetch<HarnessDoc>(listPath, {
          method: "POST",
          body: JSON.stringify({
            slug,
            filename: `${slug}.md`,
            content,
          }),
        });
        setDocId(created.id);
      } else {
        const putPath =
          scope === "global"
            ? `/api/harness/documents/${docId}`
            : `/api/projects/${projectId}/harness/documents/${docId}`;
        await apiFetch<HarnessDoc>(putPath, {
          method: "PUT",
          body: JSON.stringify({ content, filename: `${slug}.md` }),
        });
      }
      setStatus("Saved");
    } catch {
      setStatus("Save failed");
    }
  }

  return (
    <AuthGuard>
      <AppShell menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)}>
        <div className={`laed-shell mx-auto flex flex-col gap-4 px-4 pt-2 pb-[var(--laed-bottom-bar-offset)] ${menuOpen ? "opacity-35" : ""}`}>
          <p className="laed-label">Workbench</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScope("global")}
              className={`laed-label border px-2 py-1 ${scope === "global" ? "border-[var(--laed-navy)]" : "border-[var(--laed-border)]"}`}
            >
              Global
            </button>
            <button
              type="button"
              onClick={() => setScope("project")}
              className={`laed-label border px-2 py-1 ${scope === "project" ? "border-[var(--laed-navy)]" : "border-[var(--laed-border)]"}`}
            >
              Project
            </button>
            {SLUGS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlug(s)}
                className={`laed-label border px-2 py-1 ${slug === s ? "border-[var(--laed-navy)]" : "border-[var(--laed-border)]"}`}
              >
                {s}.md
              </button>
            ))}
          </div>
          {scope === "project" ? (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="laed-input max-w-md border border-[var(--laed-border)] px-2 py-1 text-[11px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[320px] w-full border border-[var(--laed-border)] bg-white p-3 font-mono text-[11px] leading-relaxed"
            style={{ borderRadius: "var(--laed-radius-sm)" }}
            placeholder={`# ${slug}.md`}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              className="laed-label cursor-pointer border-none bg-[var(--laed-navy)] px-4 py-2 text-white"
              style={{ borderRadius: "var(--laed-radius-sm)" }}
            >
              Save
            </button>
            {status !== null ? (
              <span className="text-[10px] text-[var(--laed-muted)]">{status}</span>
            ) : null}
          </div>
        </div>
        <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomBar />
      </AppShell>
    </AuthGuard>
  );
}
