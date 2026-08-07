"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AssistantHeightMode = "full" | "mid" | "minimal";
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Point = { x: number; y: number };

const MARGIN = 12;
const TOP_SAFE = 8;
const PANEL_W_MAX = 520;
const PANEL_W_MIN = 280;
const RESIZE_HANDLE = 8;
const HEADER_HEIGHT = 44;
const MIN_CONTENT_HEIGHT = 160;
const MINIMAL_HEIGHT = HEADER_HEIGHT + RESIZE_HANDLE;
const MIN_PANEL_HEIGHT = HEADER_HEIGHT + MIN_CONTENT_HEIGHT + RESIZE_HANDLE;
const NARROW_BREAKPOINT = 767;

function getViewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

function isNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`).matches;
}

function readBottomReserve(): number {
  if (typeof document === "undefined") return 80;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--laed-bottom-bar-offset")
    .trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n + MARGIN : 88;
}

export function maxPanelWidth(vw: number): number {
  return Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, vw - MARGIN * 2));
}

export function defaultPanelWidth(vw: number, narrow: boolean): number {
  if (narrow) return Math.max(PANEL_W_MIN, vw - MARGIN * 2);
  return Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, vw - MARGIN * 2));
}

export function heightForMode(
  mode: AssistantHeightMode,
  vh: number,
  bottomReserve: number,
): number {
  const usable = vh - TOP_SAFE - MARGIN - bottomReserve;
  if (mode === "minimal") return MINIMAL_HEIGHT;
  if (mode === "mid") return Math.max(MIN_PANEL_HEIGHT, Math.round(usable * 0.5));
  return Math.max(MIN_PANEL_HEIGHT, Math.round(usable * 0.88));
}

function defaultMobileHeight(vh: number, bottomReserve: number): number {
  const usable = vh - TOP_SAFE - MARGIN - bottomReserve;
  return Math.max(MIN_PANEL_HEIGHT, Math.round(usable * 0.7));
}

function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
  bottomReserve: number,
): Point {
  const maxX = Math.max(MARGIN, vw - w - MARGIN);
  const maxY = Math.max(TOP_SAFE + MARGIN, vh - h - bottomReserve);
  return {
    x: Math.min(Math.max(MARGIN, x), maxX),
    y: Math.min(Math.max(TOP_SAFE + MARGIN, y), maxY),
  };
}

function snapModeFromHeight(
  h: number,
  vh: number,
  bottomReserve: number,
): AssistantHeightMode {
  const mid = heightForMode("mid", vh, bottomReserve);
  const full = heightForMode("full", vh, bottomReserve);
  if (h <= MINIMAL_HEIGHT + 28) return "minimal";
  if (h < (mid + full) * 0.55) return "mid";
  return "full";
}

function clampWidth(w: number, vw: number): number {
  return Math.min(maxPanelWidth(vw), Math.max(PANEL_W_MIN, w));
}

function clampHeight(h: number, vh: number, bottomReserve: number): number {
  const maxH = heightForMode("full", vh, bottomReserve);
  return Math.min(maxH, Math.max(MINIMAL_HEIGHT, h));
}

type DragState = {
  kind: "move" | "resize";
  edge?: ResizeEdge;
  pointerId: number;
  startX: number;
  startY: number;
  origin: Point;
  startWidth: number;
  startHeight: number;
};

export function useAssistantFloatingPanel(open: boolean) {
  const [heightMode, setHeightMode] = useState<AssistantHeightMode>("mid");
  const [pos, setPos] = useState<Point>({ x: MARGIN, y: TOP_SAFE + MARGIN });
  const [panelWidthState, setPanelWidthState] = useState<number | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const lastExpandedMode = useRef<AssistantHeightMode>("mid");

  const placeDefault = useCallback((mode: AssistantHeightMode) => {
    const { w: vw, h: vh } = getViewport();
    const bottom = readBottomReserve();
    const isNarrow = isNarrowViewport();
    setNarrow(isNarrow);
    const pw = defaultPanelWidth(vw, isNarrow);
    const ph = isNarrow ? defaultMobileHeight(vh, bottom) : heightForMode(mode, vh, bottom);
    const x = isNarrow ? (vw - pw) / 2 : vw - pw - MARGIN;
    const y = isNarrow
      ? TOP_SAFE + MARGIN
      : vh - ph - bottom - MARGIN;
    setPanelWidthState(pw);
    setPos(clampPosition(x, y, pw, ph, vw, vh, bottom));
    if (isNarrow) {
      setHeightMode("full");
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setReady(false);
      setLiveHeight(null);
      setLiveWidth(null);
      dragRef.current = null;
      return;
    }
    if (!ready) {
      placeDefault("mid");
      setHeightMode(isNarrowViewport() ? "full" : "mid");
      setReady(true);
    }
  }, [open, ready, placeDefault]);

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`);
    const onChange = () => {
      setNarrow(mq.matches);
      const { w: vw, h: vh } = getViewport();
      const bottom = readBottomReserve();
      const pw = panelWidthState ?? defaultPanelWidth(vw, mq.matches);
      const ph =
        liveHeight ??
        (mq.matches
          ? defaultMobileHeight(vh, bottom)
          : heightForMode(heightMode, vh, bottom));
      setPos((p) => clampPosition(p.x, p.y, clampWidth(pw, vw), ph, vw, vh, bottom));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, heightMode, liveHeight, panelWidthState]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const { w: vw, h: vh } = getViewport();
      const bottom = readBottomReserve();
      const pw = clampWidth(liveWidth ?? panelWidthState ?? defaultPanelWidth(vw, narrow), vw);
      const ph =
        liveHeight ??
        (narrow
          ? defaultMobileHeight(vh, bottom)
          : heightForMode(heightMode, vh, bottom));
      setPos((p) => clampPosition(p.x, p.y, pw, ph, vw, vh, bottom));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, heightMode, liveHeight, liveWidth, panelWidthState, narrow]);

  const { w: vw, h: vh } =
    typeof window !== "undefined" ? getViewport() : { w: 390, h: 800 };
  const bottom = readBottomReserve();
  const pw = clampWidth(
    liveWidth ?? panelWidthState ?? defaultPanelWidth(vw, narrow),
    vw,
  );
  const resolvedMode =
    liveHeight !== null
      ? snapModeFromHeight(liveHeight, vh, bottom)
      : heightMode;
  const ph =
    liveHeight ??
    (narrow ? defaultMobileHeight(vh, bottom) : heightForMode(heightMode, vh, bottom));
  const isMinimal = resolvedMode === "minimal" && !narrow;

  const applyHeightMode = useCallback(
    (mode: AssistantHeightMode, anchorBottom = true) => {
      const { w: vw, h: vh } = getViewport();
      const width = clampWidth(liveWidth ?? panelWidthState ?? defaultPanelWidth(vw, narrow), vw);
      const bottomReserve = readBottomReserve();
      const prevH = liveHeight ?? heightForMode(heightMode, vh, bottomReserve);
      const nextH = heightForMode(mode, vh, bottomReserve);
      setLiveHeight(null);
      setHeightMode(mode);
      if (mode !== "minimal") {
        lastExpandedMode.current = mode;
      }
      setPos((p) => {
        const nextY = anchorBottom ? p.y + (prevH - nextH) : p.y;
        return clampPosition(p.x, nextY, width, nextH, vw, vh, bottomReserve);
      });
    },
    [heightMode, liveHeight, liveWidth, panelWidthState, narrow],
  );

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    if (drag.kind === "resize") {
      const { w: vw, h: vh } = getViewport();
      const bottomReserve = readBottomReserve();
      if (liveWidth !== null) {
        setPanelWidthState(clampWidth(liveWidth, vw));
        setLiveWidth(null);
      }
      if (liveHeight !== null) {
        const verticalOnly =
          drag.edge === "n" ||
          drag.edge === "s" ||
          drag.edge === undefined;
        if (verticalOnly && (drag.edge === "n" || drag.edge === "s" || drag.edge === undefined)) {
          const mode = snapModeFromHeight(liveHeight, vh, bottomReserve);
          applyHeightMode(mode, true);
          return;
        }
        setHeightMode(snapModeFromHeight(liveHeight, vh, bottomReserve));
        setLiveHeight(null);
      }
      return;
    }
    setLiveHeight(null);
    setLiveWidth(null);
  }, [liveHeight, liveWidth, applyHeightMode]);

  useEffect(() => {
    if (!open) return;
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      const { w: vw, h: vh } = getViewport();
      const bottomReserve = readBottomReserve();
      const widthNow = liveWidth ?? panelWidthState ?? defaultPanelWidth(vw, narrow);
      const heightNow =
        liveHeight ??
        (narrow
          ? defaultMobileHeight(vh, bottomReserve)
          : heightForMode(heightMode, vh, bottomReserve));

      if (drag.kind === "move") {
        if (narrow) return;
        const nx = e.clientX - drag.startX;
        const ny = e.clientY - drag.startY;
        setPos(clampPosition(nx, ny, widthNow, heightNow, vw, vh, bottomReserve));
        return;
      }

      const edge = drag.edge ?? "n";
      let nextW = drag.startWidth;
      let nextH = drag.startHeight;
      let nextX = drag.origin.x;
      let nextY = drag.origin.y;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (edge.includes("e")) {
        nextW = clampWidth(drag.startWidth + dx, vw);
      }
      if (edge.includes("w")) {
        const w = clampWidth(drag.startWidth - dx, vw);
        nextX = drag.origin.x + (drag.startWidth - w);
        nextW = w;
      }
      if (edge.includes("s")) {
        nextH = clampHeight(drag.startHeight + dy, vh, bottomReserve);
      }
      if (edge.includes("n")) {
        const h = clampHeight(drag.startHeight - dy, vh, bottomReserve);
        nextY = drag.origin.y + (drag.startHeight - h);
        nextH = h;
      }

      setLiveWidth(nextW);
      setLiveHeight(nextH);
      setPos(clampPosition(nextX, nextY, nextW, nextH, vw, vh, bottomReserve));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (dragRef.current?.pointerId === e.pointerId) {
        endDrag();
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [open, heightMode, liveHeight, liveWidth, panelWidthState, narrow, endDrag]);

  const startMove = useCallback(
    (e: React.PointerEvent) => {
      if (narrow || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;

      const { h: vh } = getViewport();
      const bottomReserve = readBottomReserve();
      const hNow =
        liveHeight ??
        heightForMode(heightMode, vh, bottomReserve);
      const wNow =
        liveWidth ?? panelWidthState ?? defaultPanelWidth(getViewport().w, narrow);
      dragRef.current = {
        kind: "move",
        pointerId: e.pointerId,
        startX: e.clientX - pos.x,
        startY: e.clientY - pos.y,
        origin: pos,
        startWidth: wNow,
        startHeight: hNow,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos, heightMode, liveHeight, liveWidth, panelWidthState, narrow],
  );

  const startResize = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const { w: vw, h: vh } = getViewport();
      const bottomReserve = readBottomReserve();
      const hNow =
        liveHeight ??
        (narrow
          ? defaultMobileHeight(vh, bottomReserve)
          : heightForMode(heightMode, vh, bottomReserve));
      const wNow =
        liveWidth ?? panelWidthState ?? defaultPanelWidth(vw, narrow);
      dragRef.current = {
        kind: "resize",
        edge,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origin: pos,
        startWidth: wNow,
        startHeight: hNow,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos, heightMode, liveHeight, liveWidth, panelWidthState, narrow],
  );

  const expandFromMinimal = useCallback(() => {
    applyHeightMode(lastExpandedMode.current || "mid", true);
  }, [applyHeightMode]);

  const cycleHeightMode = useCallback(() => {
    if (heightMode === "full") applyHeightMode("mid", true);
    else if (heightMode === "mid") applyHeightMode("minimal", true);
    else expandFromMinimal();
  }, [heightMode, applyHeightMode, expandFromMinimal]);

  return {
    pos,
    panelWidth: pw,
    panelHeight: ph,
    heightMode: resolvedMode,
    isMinimal,
    isNarrow: narrow,
    showBackdrop: !isMinimal,
    startMove,
    startResize,
    expandFromMinimal,
    cycleHeightMode,
    setHeightMode: applyHeightMode,
  };
}
