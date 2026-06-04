"use client";

import { useCallback, useRef, useState } from "react";
import { GridBg } from "@/components/GridBg";
import type { Position, TopologyEdge, TopologyNode } from "@/lib/types";

type Props = {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  center?: Position;
  onNodeTap: (node: TopologyNode) => void;
  onNodeDragEnd?: (nodeId: string, position: Position) => void;
  gridId?: string;
};

const DEFAULT_CENTER = { x: 195, y: 390 };

function metaSubtitle(node: TopologyNode): string {
  const sub = node.metadata.subtitle;
  if (typeof sub === "string" && sub.length > 0) return sub;
  if (node.node_type === "topic") return "Topic";
  return "Project";
}

export function TopologyCanvas({
  nodes,
  edges,
  center = DEFAULT_CENTER,
  onNodeTap,
  onNodeDragEnd,
  gridId = "topology-grid",
}: Props) {
  const dragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    origin: Position;
  } | null>(null);
  const [localPos, setLocalPos] = useState<Record<string, Position>>({});

  const getPos = useCallback(
    (node: TopologyNode): Position => localPos[node.id] ?? node.position,
    [localPos],
  );

  const onPointerDown = (
    node: TopologyNode,
    clientX: number,
    clientY: number,
    e: React.PointerEvent,
  ) => {
    if (node.node_type === "project" || !onNodeDragEnd) return;
    e.stopPropagation();
    dragRef.current = {
      nodeId: node.id,
      startX: clientX,
      startY: clientY,
      origin: getPos(node),
    };
  };

  const onPointerMove = (clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (d === null) return;
    setLocalPos((prev) => ({
      ...prev,
      [d.nodeId]: {
        x: d.origin.x + (clientX - d.startX),
        y: d.origin.y + (clientY - d.startY),
      },
    }));
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (d === null || !onNodeDragEnd) return;
    onNodeDragEnd(d.nodeId, localPos[d.nodeId] ?? d.origin);
    dragRef.current = null;
  };

  return (
    <div
      className="relative h-[min(70vh,600px)] w-full overflow-hidden"
      onPointerMove={(e) => onPointerMove(e.clientX, e.clientY)}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <GridBg id={gridId} />
      <svg className="absolute inset-0 h-full w-full touch-none">
        {edges.map((edge) => {
          const src = nodes.find((n) => n.id === edge.source_node_id);
          const tgt = nodes.find((n) => n.id === edge.target_node_id);
          if (!src || !tgt) return null;
          const sp = getPos(src);
          const tp = getPos(tgt);
          return (
            <line
              key={edge.id}
              x1={center.x + sp.x}
              y1={center.y + sp.y}
              x2={center.x + tp.x}
              y2={center.y + tp.y}
              stroke="rgba(26,25,23,0.10)"
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((node) => {
          const pos = getPos(node);
          const cx = center.x + pos.x;
          const cy = center.y + pos.y;
          const isProject = node.node_type === "project";
          const isTopic = node.node_type === "topic";
          const r = isProject ? 46 : 38;
          const archived =
            node.metadata.archived === true ||
            node.metadata.archived === "true";
          const accentGreen = node.metadata.accent === "green";
          const subtitle = metaSubtitle(node);

          return (
            <g
              key={node.id}
              style={{ cursor: "pointer", opacity: archived ? 0.45 : 1 }}
              onClick={() => onNodeTap(node)}
              onPointerDown={(e) => onPointerDown(node, e.clientX, e.clientY, e)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={
                  accentGreen
                    ? "rgba(45,106,79,0.28)"
                    : "rgba(26,25,23,0.12)"
                }
                strokeWidth={1}
                strokeDasharray={archived ? "3 4" : undefined}
              />
              {!archived ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r - 8}
                  fill={
                    accentGreen
                      ? "rgba(45,106,79,0.06)"
                      : "rgba(26,25,23,0.04)"
                  }
                />
              ) : null}
              {isTopic ? (
                <circle
                  cx={cx + r * 0.5}
                  cy={cy - r * 0.5}
                  r={4.5}
                  fill="var(--laed-navy)"
                />
              ) : null}
              <text
                x={cx}
                y={cy - 4}
                textAnchor="middle"
                fontSize={isProject ? 10 : 8}
                fontWeight={600}
                letterSpacing={isProject ? 2 : 1.2}
                fill={archived ? "#8A8780" : "#1A1917"}
              >
                {node.label.toUpperCase()}
              </text>
              <text
                x={cx}
                y={cy + (isProject ? 12 : 14)}
                textAnchor="middle"
                fontSize={7}
                fill="#8A8780"
              >
                {subtitle}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
