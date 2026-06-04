import type { Position, Project, TopologyNode } from "@/lib/types";

function projectTags(p: Project): string[] {
  return p.tags ?? [];
}

function sharedTagCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((t) => setB.has(t)).length;
}

/** Union-find clusters by shared tags (untagged = own cluster). */
function buildClusters(projects: Project[]): Map<string, number> {
  const projectIds = projects.map((p) => p.id);
  const parent = new Map<string, string>();
  for (const id of projectIds) {
    parent.set(id, id);
  }

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }
    let cur = id;
    while (cur !== root) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function unite(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (let i = 0; i < projects.length; i += 1) {
    const pi = projects[i];
    if (pi === undefined) continue;
    const tagsI = projectTags(pi);
    for (let j = i + 1; j < projects.length; j += 1) {
      const pj = projects[j];
      if (pj === undefined) continue;
      if (tagsI.length === 0 && projectTags(pj).length === 0) continue;
      if (sharedTagCount(tagsI, projectTags(pj)) > 0) {
        unite(pi.id, pj.id);
      }
    }
  }

  const clusterIndex = new Map<string, number>();
  let idx = 0;
  const rootToIdx = new Map<string, number>();
  for (const id of projectIds) {
    const root = find(id);
    if (!rootToIdx.has(root)) {
      rootToIdx.set(root, idx);
      idx += 1;
    }
    clusterIndex.set(id, rootToIdx.get(root) ?? 0);
  }
  return clusterIndex;
}

const CLUSTER_SPACING_X = 200;
const CLUSTER_SPACING_Y = 180;
const NODE_SPACING = 72;

/**
 * Visual-only display positions for global project nodes when grouped by tag similarity.
 */
export function clusterByTagSimilarity(
  projects: Project[],
  nodes: TopologyNode[],
  storedPositions: Record<string, Position>,
): Record<string, Position> {
  const projectNodes = nodes.filter(
    (n) => n.node_type === "project" && n.ref_id !== null,
  );
  if (projectNodes.length === 0) return {};

  const refToProject = new Map(projects.map((p) => [p.id, p]));
  const involved = projectNodes
    .map((n) => refToProject.get(n.ref_id ?? ""))
    .filter((p): p is Project => p !== undefined);

  const clusterOf = buildClusters(involved);
  const byCluster = new Map<number, TopologyNode[]>();
  for (const node of projectNodes) {
    const pid = node.ref_id ?? "";
    const c = clusterOf.get(pid) ?? 0;
    const list = byCluster.get(c) ?? [];
    list.push(node);
    byCluster.set(c, list);
  }

  const out: Record<string, Position> = {};
  const clusterIds = [...byCluster.keys()].sort((a, b) => a - b);
  const cols = Math.ceil(Math.sqrt(clusterIds.length));

  clusterIds.forEach((clusterId, clusterIdx) => {
    const col = clusterIdx % cols;
    const row = Math.floor(clusterIdx / cols);
    const cx = (col - (cols - 1) / 2) * CLUSTER_SPACING_X;
    const cy = (row - (clusterIds.length - 1) / (2 * cols)) * CLUSTER_SPACING_Y;
    const members = byCluster.get(clusterId) ?? [];
    members.forEach((node, i) => {
      const stored = storedPositions[node.id] ?? node.position;
      const angle = (i / Math.max(members.length, 1)) * Math.PI * 2;
      const ring = members.length > 1 ? NODE_SPACING : 0;
      out[node.id] = {
        x: Math.round(cx + Math.cos(angle) * ring + stored.x * 0.15),
        y: Math.round(cy + Math.sin(angle) * ring + stored.y * 0.15),
      };
    });
  });

  return out;
}
