"use client";

import { useCallback, useMemo, useState } from "react";
import { TopologyCanvas } from "@/components/TopologyCanvas";
import { useTopology } from "@/lib/hooks/useTopology";
import { clusterByTagSimilarity } from "@/lib/tagClusterLayout";
import type { Position, Project, TopologyNode } from "@/lib/types";

type Props = {
  projects: Project[];
  onOpenProject: (projectId: string) => void;
  onAddNew: () => void;
  badgesByNodeId?: Record<string, { initials: string }[]>;
};

function projectTags(p: Project): string[] {
  return p.tags ?? [];
}

export function HomeCanvas({
  projects,
  onOpenProject,
  onAddNew,
  badgesByNodeId,
}: Props) {
  const { graph, loading, error, updatePosition } = useTopology({ kind: "global" });
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [groupByTags, setGroupByTags] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) {
      for (const t of projectTags(p)) {
        set.add(t);
      }
    }
    return [...set].sort();
  }, [projects]);

  const projectByRef = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  const filteredNodes = useMemo(() => {
    if (graph === null) return [];
    return graph.nodes.filter((n) => {
      if (n.node_type !== "project" || n.ref_id === null) return true;
      const p = projectByRef.get(n.ref_id);
      if (!p) return false;
      if (activeTag === null) return true;
      return projectTags(p).includes(activeTag);
    });
  }, [graph, projectByRef, activeTag]);

  const storedPositions = useMemo(() => {
    const map: Record<string, Position> = {};
    for (const n of filteredNodes) {
      map[n.id] = n.position;
    }
    return map;
  }, [filteredNodes]);

  const positionOverrides = useMemo(() => {
    if (!groupByTags) return undefined;
    return clusterByTagSimilarity(projects, filteredNodes, storedPositions);
  }, [groupByTags, projects, filteredNodes, storedPositions]);

  const onNodeTap = useCallback(
    (node: TopologyNode) => {
      if (node.node_type === "project" && node.ref_id) {
        onOpenProject(node.ref_id);
      }
    },
    [onOpenProject],
  );

  const onNodeDragEnd = useCallback(
    (nodeId: string, position: Position) => {
      void updatePosition(nodeId, position);
    },
    [updatePosition],
  );

  if (loading) {
    return <p className="laed-label p-4">Loading canvas…</p>;
  }
  if (error !== null || graph === null) {
    return <p className="p-4 text-[10px] text-red-700">{error ?? "Canvas unavailable"}</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2 md:px-6">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <p className="laed-label mr-2">Projects</p>
        <button
          type="button"
          onClick={onAddNew}
          className="laed-btn-private py-1.5 px-3 text-[9px]"
        >
          + New
        </button>
        <button
          type="button"
          onClick={() => setGroupByTags((v) => !v)}
          className={`laed-label border px-2 py-1 ${
            groupByTags
              ? "border-[var(--laed-private-accent)] bg-[var(--laed-private-accent)] text-white"
              : "border-[var(--laed-border)] bg-white text-[var(--laed-muted)]"
          }`}
          style={{ borderRadius: "var(--laed-radius-sm)" }}
        >
          Group by tags
        </button>
      </div>

      {allTags.length > 0 ? (
        <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`rounded-full border px-2 py-0.5 text-[9px] ${
              activeTag === null
                ? "border-[var(--laed-private-accent)] bg-[var(--laed-private-accent)] text-white"
                : "border-[var(--laed-border)] text-[var(--laed-muted)]"
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={`rounded-full border px-2 py-0.5 text-[9px] ${
                activeTag === tag
                  ? "border-[var(--laed-private-accent)] bg-[var(--laed-private-accent)] text-white"
                  : "border-[var(--laed-border)] text-[var(--laed-muted)]"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      <TopologyCanvas
        nodes={filteredNodes}
        edges={graph.edges}
        onNodeTap={onNodeTap}
        onNodeDragEnd={onNodeDragEnd}
        allowProjectDrag
        fillHeight
        accent="private"
        positionOverrides={positionOverrides}
        badgesByNodeId={badgesByNodeId}
        gridId="home-topology-grid"
      />
    </div>
  );
}
