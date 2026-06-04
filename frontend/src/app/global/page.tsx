"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { BottomBar } from "@/components/BottomBar";
import { TopologyCanvas } from "@/components/TopologyCanvas";
import { useTopology } from "@/lib/hooks/useTopology";
import type { TopologyNode } from "@/lib/types";

export default function GlobalCanvasPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { graph, loading, error, updatePosition } = useTopology({ kind: "global" });

  const displayNodes =
    graph?.nodes.filter(
      (n) => n.scope_type === "global" && n.node_type === "project",
    ) ?? [];

  function handleTap(node: TopologyNode) {
    if (node.node_type === "project" && node.ref_id) {
      router.push(`/projects/${node.ref_id}/canvas`);
    }
  }

  return (
    <AuthGuard>
      <AppShell menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)}>
        <div className={`pb-24 ${menuOpen ? "opacity-35" : ""} transition-opacity`}>
          {loading ? (
            <p className="laed-label p-4">Loading…</p>
          ) : null}
          {error !== null ? (
            <p className="p-4 text-[10px] text-red-700">{error}</p>
          ) : null}
          {graph !== null ? (
            <TopologyCanvas
              nodes={displayNodes}
              edges={[]}
              center={{ x: 195, y: 320 }}
              onNodeTap={handleTap}
              onNodeDragEnd={(id, pos) => void updatePosition(id, pos)}
              gridId="grid-global"
            />
          ) : null}
        </div>
        <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <BottomBar />
      </AppShell>
    </AuthGuard>
  );
}
