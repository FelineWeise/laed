"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type {
  ExplicitContextItem,
  Project,
  ProjectFile,
  TopologyGraph,
} from "@/lib/types";

type Props = {
  projectId?: string;
  topicNodeId?: string | null;
  items: ExplicitContextItem[];
  onChange: (items: ExplicitContextItem[]) => void;
};

export function ContextPicker({
  projectId,
  topicNodeId = null,
  items,
  onChange,
}: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [topics, setTopics] = useState<{ id: string; label: string }[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void apiFetch<Project[]>("/api/projects").then(setProjects);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void apiFetch<TopologyGraph>(`/api/projects/${projectId}/topology`).then((g) => {
      setTopics(
        g.nodes
          .filter((n) => n.node_type === "topic")
          .map((n) => ({ id: n.id, label: n.label })),
      );
    });
    const q = topicNodeId ? `?topic_node_id=${topicNodeId}` : "";
    void apiFetch<ProjectFile[]>(`/api/projects/${projectId}/files${q}`).then(setFiles);
  }, [projectId, topicNodeId]);

  function add(item: ExplicitContextItem) {
    if (items.some((i) => i.type === item.type && i.ref_id === item.ref_id)) return;
    onChange([...items, item]);
    setOpen(false);
  }

  function remove(refId: string) {
    onChange(items.filter((i) => i.ref_id !== refId));
  }

  return (
    <div className="mb-2 w-full">
      {items.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={`${item.type}-${item.ref_id}`}
              className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--laed-border)] bg-white px-2 py-0.5 text-[8px] text-[var(--laed-muted)]"
            >
              {item.label || item.type}
              <button
                type="button"
                aria-label="Remove context"
                onClick={() => remove(item.ref_id)}
                className="text-[var(--laed-ink)]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative flex gap-1">
        <button
          type="button"
          className="shrink-0 rounded-full border border-[var(--laed-border)] px-2 py-1 text-[8px] uppercase tracking-[1px] text-[var(--laed-muted)]"
          onClick={() => setOpen((v) => !v)}
        >
          @ Context
        </button>
        {open ? (
          <div
            className="absolute bottom-full left-0 z-30 mb-1 max-h-36 w-56 overflow-y-auto border border-[var(--laed-border)] bg-white p-1 shadow-sm"
            style={{ borderRadius: "var(--laed-radius-sm)" }}
          >
            {projectId ? (
              <button
                type="button"
                className="block w-full px-2 py-1.5 text-left text-[9px] hover:bg-[rgba(26,25,23,0.04)]"
                onClick={() =>
                  add({
                    type: "project",
                    ref_id: projectId,
                    label: "This project",
                  })
                }
              >
                This project
              </button>
            ) : null}
            {topicNodeId ? (
              <button
                type="button"
                className="block w-full px-2 py-1.5 text-left text-[9px] hover:bg-[rgba(26,25,23,0.04)]"
                onClick={() =>
                  add({
                    type: "topic",
                    ref_id: topicNodeId,
                    label: "This topic",
                  })
                }
              >
                This topic
              </button>
            ) : null}
            {topics.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                className="block w-full px-2 py-1.5 text-left text-[9px] hover:bg-[rgba(26,25,23,0.04)]"
                onClick={() => add({ type: "topic", ref_id: t.id, label: t.label })}
              >
                Topic: {t.label}
              </button>
            ))}
            {files.slice(0, 6).map((f) => (
              <button
                key={f.id}
                type="button"
                className="block w-full px-2 py-1.5 text-left text-[9px] hover:bg-[rgba(26,25,23,0.04)]"
                onClick={() =>
                  add({ type: "file", ref_id: f.id, label: f.filename })
                }
              >
                File: {f.filename}
              </button>
            ))}
            <button
              type="button"
              className="block w-full px-2 py-1.5 text-left text-[9px] hover:bg-[rgba(26,25,23,0.04)]"
              onClick={() =>
                projectId
                  ? add({
                      type: "thread",
                      ref_id: `project:${projectId}`,
                      label: "Recent thread",
                    })
                  : undefined
              }
            >
              Recent thread (project)
            </button>
            {projects
              .filter((p) => p.id !== projectId)
              .slice(0, 8)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full px-2 py-1.5 text-left text-[9px] hover:bg-[rgba(26,25,23,0.04)]"
                  onClick={() =>
                    add({ type: "project", ref_id: p.id, label: p.name })
                  }
                >
                  Project: {p.name}
                </button>
              ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
