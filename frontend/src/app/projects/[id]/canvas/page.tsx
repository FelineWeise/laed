"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Member } from "@/lib/types";
import { AppMenu } from "@/components/AppMenu";
import { AppShell } from "@/components/AppShell";
import { AssistantPanel } from "@/components/AssistantPanel";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { TopologyCanvas } from "@/components/TopologyCanvas";
import { useTopology } from "@/lib/hooks/useTopology";
import { useTopologyMemberBadges } from "@/lib/hooks/useTopologyMemberBadges";
import type { TopologyNode } from "@/lib/types";

export default function ProjectCanvasPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ id: string }>("/api/auth/me").then((u) => setMyUserId(u.id));
  }, []);

  const loadRole = useCallback(async () => {
    if (myUserId === null) return;
    try {
      const members = await apiFetch<Member[]>(`/api/projects/${projectId}/members`);
      const me = members.find((m) => m.user_id === myUserId);
      setMyRole(me?.role ?? null);
    } catch {
      setMyRole(null);
    }
  }, [projectId, myUserId]);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

  const canDelete = myRole === "owner";
  const { graph, loading, error, updatePosition, createTopic } = useTopology({
    kind: "project",
    projectId,
  });
  const badgesByNodeId = useTopologyMemberBadges(
    projectId,
    graph?.nodes ?? [],
    graph !== null,
  );

  const projectName = useMemo(() => {
    const center = graph?.nodes.find(
      (n) => n.node_type === "project" && n.ref_id === projectId,
    );
    return center?.label ?? "Project";
  }, [graph, projectId]);

  function handleTap(node: TopologyNode) {
    if (node.node_type === "project") {
      router.push(`/projects/${projectId}/room`);
      return;
    }
    if (node.node_type === "topic") {
      router.push(`/projects/${projectId}/room?tab=thread&topicId=${node.id}`);
    }
  }

  async function addTopic() {
    const label = window.prompt("Topic name");
    if (label === null || label.trim() === "") return;
    await createTopic(label.trim());
  }

  async function deleteProject() {
    if (
      !window.confirm(
        `Permanently delete “${projectName}”? This removes all threads, files, and data. This cannot be undone.`,
      )
    ) {
      return;
    }
    await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" });
    router.push("/global");
  }

  return (
    <AuthGuard>
      <AppShell
        breadcrumb={{
          label: `← ${projectName.toUpperCase()}`,
          onClick: () => router.push("/global"),
        }}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((o) => !o)}
        right={
          <div className="flex items-center gap-3">
            {canDelete ? (
              <button
                type="button"
                onClick={() => void deleteProject()}
                className="laed-label cursor-pointer border-none bg-transparent p-0 text-red-700"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void addTopic()}
              className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-navy)]"
            >
              + Topic
            </button>
          </div>
        }
      >
        <div className={`laed-page-fill ${menuOpen ? "opacity-35" : ""}`}>
          {loading ? <p className="laed-label p-4">Loading…</p> : null}
          {error !== null ? (
            <p className="p-4 text-[10px] text-red-700">{error}</p>
          ) : null}
          {graph !== null ? (
            <TopologyCanvas
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeTap={handleTap}
              onNodeDragEnd={(id, pos) => void updatePosition(id, pos)}
              fillHeight
              badgesByNodeId={badgesByNodeId}
              gridId={`grid-project-${projectId}`}
            />
          ) : null}
        </div>
        <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <AssistantPanel
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          context="project"
          projectId={projectId}
        />
        <BottomBar
          projectId={projectId}
          assistantOpen={assistantOpen}
          onAssistantToggle={() => setAssistantOpen((o) => !o)}
        />
      </AppShell>
    </AuthGuard>
  );
}
