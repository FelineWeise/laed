"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Project, TopologyGraph } from "@/lib/types";

type Props = {
  projectId: string | null;
  topicNodeId: string | null;
  onProjectChange: (id: string | null) => void;
  onTopicChange: (id: string | null) => void;
  className?: string;
};

export function ProjectTopicPicker({
  projectId,
  topicNodeId,
  onProjectChange,
  onTopicChange,
  className = "",
}: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [topics, setTopics] = useState<{ id: string; label: string }[]>([]);

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

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      <select
        value={projectId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onProjectChange(v === "" ? null : v);
          onTopicChange(null);
        }}
        className="max-w-[160px] border border-[var(--laed-border)] bg-white px-2 py-1 text-[9px]"
        aria-label="Project"
      >
        <option value="">No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {projectId !== null && topics.length > 0 ? (
        <select
          value={topicNodeId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onTopicChange(v === "" ? null : v);
          }}
          className="max-w-[160px] border border-[var(--laed-border)] bg-white px-2 py-1 text-[9px]"
          aria-label="Topic"
        >
          <option value="">Project level</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
