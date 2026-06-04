"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Position, TopologyGraph, TopologyNode } from "@/lib/types";

type Scope = { kind: "global" } | { kind: "project"; projectId: string };

export function useTopology(scope: Scope) {
  const [graph, setGraph] = useState<TopologyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scopeKind = scope.kind;
  const projectId = scope.kind === "project" ? scope.projectId : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path =
        scopeKind === "global"
          ? "/api/topology/global"
          : `/api/projects/${projectId}/topology`;
      const data = await apiFetch<TopologyGraph>(path);
      setGraph(data);
    } catch {
      setError("Failed to load topology");
    } finally {
      setLoading(false);
    }
  }, [scopeKind, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updatePosition = useCallback(
    async (nodeId: string, position: Position) => {
      await apiFetch<TopologyNode>(`/api/topology/nodes/${nodeId}`, {
        method: "PATCH",
        body: JSON.stringify({ position }),
      });
      setGraph((prev) => {
        if (prev === null) return prev;
        return {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === nodeId ? { ...n, position } : n,
          ),
        };
      });
    },
    [],
  );

  const createTopic = useCallback(
    async (label: string) => {
      if (scopeKind !== "project" || projectId === undefined) return null;
      const node = await apiFetch<TopologyNode>(
        `/api/projects/${projectId}/topology/nodes`,
        {
          method: "POST",
          body: JSON.stringify({ label }),
        },
      );
      await load();
      return node;
    },
    [scopeKind, projectId, load],
  );

  return { graph, loading, error, reload: load, updatePosition, createTopic };
}
