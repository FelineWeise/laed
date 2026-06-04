"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Member, TopologyNode } from "@/lib/types";
import type { NodeBadge } from "@/components/TopologyCanvas";

function initialsFromMember(m: Member): string {
  const name = (m.display_name ?? m.email ?? "?").trim();
  return name.length > 0 ? name[0]?.toUpperCase() ?? "?" : "?";
}

export function useTopologyMemberBadges(
  projectId: string,
  nodes: TopologyNode[],
  enabled: boolean,
): Record<string, NodeBadge[]> {
  const [badgesByNodeId, setBadgesByNodeId] = useState<
    Record<string, NodeBadge[]>
  >({});

  useEffect(() => {
    if (!enabled || nodes.length === 0) {
      setBadgesByNodeId({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const map: Record<string, NodeBadge[]> = {};
      const center = nodes.find(
        (n) => n.node_type === "project" && n.ref_id === projectId,
      );
      if (center) {
        try {
          const members = await apiFetch<Member[]>(
            `/api/projects/${projectId}/members`,
          );
          map[center.id] = members.map((m) => ({
            initials: initialsFromMember(m),
          }));
        } catch {
          /* ignore */
        }
      }

      const topics = nodes.filter((n) => n.node_type === "topic");
      await Promise.all(
        topics.map(async (topic) => {
          try {
            const members = await apiFetch<Member[]>(
              `/api/topology/nodes/${topic.id}/members`,
            );
            map[topic.id] = members.map((m) => ({
              initials: initialsFromMember(m),
            }));
          } catch {
            /* ignore */
          }
        }),
      );

      if (!cancelled) setBadgesByNodeId(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, nodes, enabled]);

  return badgesByNodeId;
}
