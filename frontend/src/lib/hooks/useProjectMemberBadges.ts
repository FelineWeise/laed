"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Member, Project, TopologyNode } from "@/lib/types";
import type { NodeBadge } from "@/components/TopologyCanvas";

function initialsFromMember(m: Member): string {
  const name = (m.display_name ?? m.email ?? "?").trim();
  return name.length > 0 ? name[0]?.toUpperCase() ?? "?" : "?";
}

export function useProjectMemberBadges(
  projects: Project[],
  enabled: boolean,
): Record<string, NodeBadge[]> {
  const [badgesByNodeId, setBadgesByNodeId] = useState<
    Record<string, NodeBadge[]>
  >({});

  useEffect(() => {
    if (!enabled || projects.length === 0) {
      setBadgesByNodeId({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const graph = await apiFetch<{ nodes: TopologyNode[] }>(
        "/api/topology/global",
      );
      const nodeByRef = new Map<string, string>();
      for (const n of graph.nodes) {
        if (n.node_type === "project" && n.ref_id) {
          nodeByRef.set(n.ref_id, n.id);
        }
      }

      const entries = await Promise.all(
        projects.map(async (p) => {
          try {
            const members = await apiFetch<Member[]>(
              `/api/projects/${p.id}/members`,
            );
            const nodeId = nodeByRef.get(p.id);
            if (!nodeId) return null;
            return [
              nodeId,
              members.map((m) => ({ initials: initialsFromMember(m) })),
            ] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      const map: Record<string, NodeBadge[]> = {};
      for (const e of entries) {
        if (e !== null) {
          map[e[0]] = e[1];
        }
      }
      setBadgesByNodeId(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [projects, enabled]);

  return badgesByNodeId;
}
