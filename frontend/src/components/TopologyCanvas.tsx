"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { GridBg } from "@/components/GridBg";
import type { Position, TopologyEdge, TopologyNode } from "@/lib/types";

export type NodeBadge = { initials: string };

type Props = {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  center?: Position;
  onNodeTap: (node: TopologyNode) => void;
  onNodeDragEnd?: (nodeId: string, position: Position) => void;
  allowProjectDrag?: boolean;
  fillHeight?: boolean;
  /** Private overview = green badges; project canvas = navy */
  accent?: "private" | "project";
  positionOverrides?: Record<string, Position>;
  badgesByNodeId?: Record<string, NodeBadge[]>;
  gridId?: string;
};

function metaSubtitle(node: TopologyNode): string {
  const sub = node.metadata.subtitle;
  if (typeof sub === "string" && sub.length > 0) return sub;
  if (node.node_type === "topic") return "Topic";
  return "Project";
}

export function TopologyCanvas({
  nodes,
  edges,
  center,
  onNodeTap,
  onNodeDragEnd,
  allowProjectDrag = false,
  fillHeight = false,
  accent = "project",
  positionOverrides,
  badgesByNodeId,
  gridId = "topology-grid",
}: Props) {
  const badgeFill =
    accent === "private"
      ? "var(--laed-private-accent)"
      : "var(--laed-navy)";
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewCenter, setViewCenter] = useState<Position>({ x: 400, y: 300 });
  const dragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    origin: Position;
  } | null>(null);
  const [localPos, setLocalPos] = useState<Record<string, Position>>({});

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setViewCenter(
        center ?? { x: Math.round(width / 2), y: Math.round(height / 2) },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [center]);

  const getPos = useCallback(
    (node: TopologyNode): Position =>
      localPos[node.id] ??
      positionOverrides?.[node.id] ??
      node.position,
    [localPos, positionOverrides],
  );

  const onPointerDown = (
    node: TopologyNode,
    clientX: number,
    clientY: number,
    e: React.PointerEvent,
  ) => {
    if ((node.node_type === "project" && !allowProjectDrag) || !onNodeDragEnd) return;
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

  const heightClass = fillHeight
    ? "relative min-h-0 flex-1 w-full overflow-hidden"
    : "relative h-[min(70vh,600px)] w-full overflow-hidden";

  return (
    <div
      ref={containerRef}
      className={heightClass}
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
              x1={viewCenter.x + sp.x}
              y1={viewCenter.y + sp.y}
              x2={viewCenter.x + tp.x}
              y2={viewCenter.y + tp.y}
              stroke="rgba(26,25,23,0.10)"
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((node) => {
          const pos = getPos(node);
          const cx = viewCenter.x + pos.x;
          const cy = viewCenter.y + pos.y;
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
                  fill={badgeFill}
                />
              ) : null}
              {(badgesByNodeId?.[node.id] ?? []).slice(0, 4).map((badge, bi) => {
                const n = badgesByNodeId?.[node.id]?.length ?? 0;
                const startAngle = Math.PI * 0.85;
                const endAngle = Math.PI * 0.15;
                const t =
                  n <= 1
                    ? 0.5
                    : bi / Math.max(Math.min(n, 4) - 1, 1);
                const angle = startAngle + t * (endAngle - startAngle);
                const br = 7;
                const bx = cx + Math.cos(angle) * (r + 6);
                const by = cy + Math.sin(angle) * (r + 6);
                return (
                  <g key={`${node.id}-badge-${bi}`}>
                    <circle
                      cx={bx}
                      cy={by}
                      r={br}
                      fill={badgeFill}
                      stroke="white"
                      strokeWidth={1}
                    />
                    <text
                      x={bx}
                      y={by + 2.5}
                      textAnchor="middle"
                      fontSize={6}
                      fontWeight={600}
                      fill="white"
                    >
                      {badge.initials}
                    </text>
                  </g>
                );
              })}
              {(badgesByNodeId?.[node.id]?.length ?? 0) > 4 ? (
                <text
                  x={cx}
                  y={cy - r - 14}
                  textAnchor="middle"
                  fontSize={6}
                  fill="#8A8780"
                >
                  +{(badgesByNodeId?.[node.id]?.length ?? 0) - 4}
                </text>
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
