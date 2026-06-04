"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { TopologyCanvas } from "@/components/TopologyCanvas";
import { useTopology } from "@/lib/hooks/useTopology";
import type { TopologyNode } from "@/lib/types";

export default function ProjectCanvasPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { graph, loading, error, updatePosition, createTopic } = useTopology({
    kind: "project",
    projectId,
  });

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
          <button
            type="button"
            onClick={() => void addTopic()}
            className="laed-label cursor-pointer border-none bg-transparent text-[var(--laed-navy)]"
          >
            + Topic
          </button>
        }
      >
        <div className={`pb-24 ${menuOpen ? "opacity-35" : ""}`}>
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
              gridId={`grid-project-${projectId}`}
            />
          ) : null}
        </div>
        <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomBar projectId={projectId} />
      </AppShell>
    </AuthGuard>
  );
}
