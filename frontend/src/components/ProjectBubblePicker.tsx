"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Project, TopologyGraph } from "@/lib/types";
import { useIsNarrowViewport } from "@/lib/hooks/useMediaQuery";

type Props = {
  projectId: string | null;
  topicNodeId: string | null;
  isPrivate: boolean;
  onProjectChange: (id: string | null) => void;
  onTopicChange: (id: string | null) => void;
  onPrivateChange?: (isPrivate: boolean) => void;
  className?: string;
};

function Bubble({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer border px-3 py-1.5 text-[8px] tracking-[1px] uppercase transition-colors ${
        active
          ? "border-[var(--laed-private-accent)] bg-[var(--laed-private-bg)] text-[var(--laed-private-accent)]"
          : "border-[rgba(26,25,23,0.12)] bg-[var(--laed-paper-elevated)] text-[var(--laed-muted)] hover:border-[var(--laed-private-border)]"
      }`}
      style={{ borderRadius: "999px" }}
    >
      {label}
    </button>
  );
}

export function ProjectBubblePicker({
  projectId,
  topicNodeId,
  isPrivate,
  onProjectChange,
  onTopicChange,
  onPrivateChange,
  className = "",
}: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [topics, setTopics] = useState<{ id: string; label: string }[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isNarrow = useIsNarrowViewport();

  useEffect(() => {
    void apiFetch<Project[]>("/api/projects").then(setProjects);
  }, []);

  useEffect(() => {
    if (projectId === null) {
      setTopics([]);
      return;
    }
    void apiFetch<TopologyGraph>(`/api/projects/${projectId}/topology`).then((g) => {
      const nodes = g.nodes
        .filter((n) => n.node_type === "topic" || n.node_type === "subtopic")
        .map((n) => ({ id: n.id, label: n.label }));
      setTopics(nodes);
    });
  }, [projectId]);

  const panel = (
    <aside
      className={`flex flex-col gap-4 ${isNarrow ? "p-4" : "min-h-0 shrink-0 overflow-y-auto border-l border-[var(--laed-border)] p-4 w-[min(33vw,20rem)]"} ${className}`.trim()}
      style={{ background: "var(--laed-paper)" }}
    >
      <div>
        <p className="laed-label mb-2">Project</p>
        <div className="flex flex-wrap gap-2">
          <Bubble
            label="None"
            active={projectId === null}
            onClick={() => {
              onProjectChange(null);
              onTopicChange(null);
            }}
          />
          {projects.map((p) => (
            <Bubble
              key={p.id}
              label={p.name}
              active={projectId === p.id}
              onClick={() => {
                onProjectChange(p.id);
                onTopicChange(null);
              }}
            />
          ))}
        </div>
      </div>
      {projectId !== null && topics.length > 0 ? (
        <div>
          <p className="laed-label mb-2">Sub-project</p>
          <div className="flex flex-wrap gap-2">
            <Bubble
              label="Project level"
              active={topicNodeId === null}
              onClick={() => onTopicChange(null)}
            />
            {topics.map((t) => (
              <Bubble
                key={t.id}
                label={t.label}
                active={topicNodeId === t.id}
                onClick={() => onTopicChange(t.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {onPrivateChange ? (
        <label className="flex cursor-pointer items-center gap-2 text-[9px] text-[var(--laed-muted)]">
          <input
            type="checkbox"
            className="laed-control-private"
            checked={!isPrivate}
            onChange={(e) => onPrivateChange(!e.target.checked)}
          />
          Share with project
        </label>
      ) : null}
    </aside>
  );

  if (isNarrow) {
    return (
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="laed-btn-private text-[8px]"
        >
          Associate project
        </button>
        {mobileOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[170] cursor-default border-none bg-black/25"
              aria-label="Close project picker"
              onClick={() => setMobileOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-[180] max-h-[70dvh] overflow-y-auto rounded-t-[var(--laed-radius-md)] shadow-[var(--laed-shadow-pop)]">
              {panel}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return panel;
}
