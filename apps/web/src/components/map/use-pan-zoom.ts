"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  INITIAL_VIEWPORT,
  panBy,
  pixelsToCanvas,
  zoomAt,
  zoomCenter,
  ZOOM_STEP,
  type Viewport,
} from "@/lib/map-viewport";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/wallet-map";

/** Gerakan sejauh ini (px) baru dianggap menyeret, bukan klik. */
const DRAG_THRESHOLD = 4;
/** Jarak geser per tekan tombol panah, dalam satuan kanvas pada skala 1. */
const ARROW_STEP = 60;

interface Gesture {
  pointers: Map<number, { x: number; y: number }>;
  start: Viewport;
  origin: { x: number; y: number };
  moved: boolean;
  pinchDistance: number;
}

/**
 * Pan & zoom untuk SVG peta:
 * - seret untuk menggeser; klik yang tidak bergeser tetap memilih gelembung,
 * - Ctrl/⌘ + scroll atau cubit trackpad untuk zoom di posisi kursor,
 * - dua jari untuk zoom di layar sentuh,
 * - tombol +, −, 0, dan panah dari keyboard.
 * Scroll biasa tetap menggulir halaman.
 */
export function usePanZoom() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  /** Klik yang mengakhiri seretan tidak boleh ikut memilih gelembung. */
  const suppressClick = useRef(false);

  /** Posisi layar menjadi koordinat kanvas pada viewport `from`. */
  function toCanvas(from: Viewport, clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    return {
      x: from.x + ((clientX - rect.left) / rect.width) * (MAP_WIDTH / from.scale),
      y: from.y + ((clientY - rect.top) / rect.height) * (MAP_HEIGHT / from.scale),
    };
  }

  // Listener wheel harus non-passive supaya bisa mencegah zoom bawaan browser.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.01);
      setViewport((current) => {
        const point = toCanvas(current, event.clientX, event.clientY);
        return zoomAt(current, factor, point.x, point.y);
      });
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const pointers = gesture.current?.pointers ?? new Map();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    gesture.current = {
      pointers,
      start: viewport,
      origin: points.length === 2 ? midpoint(points[0], points[1]) : { x: event.clientX, y: event.clientY },
      moved: gesture.current?.moved ?? false,
      pinchDistance: points.length === 2 ? distance(points[0], points[1]) : 0,
    };
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current?.pointers.has(event.pointerId)) return;
    current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...current.pointers.values()];

    if (points.length >= 2 && current.pinchDistance > 0) {
      current.moved = true;
      setDragging(true);
      const center = toCanvas(current.start, current.origin.x, current.origin.y);
      setViewport(zoomAt(current.start, distance(points[0], points[1]) / current.pinchDistance, center.x, center.y));
      return;
    }

    const dx = event.clientX - current.origin.x;
    const dy = event.clientY - current.origin.y;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!current.moved) {
      current.moved = true;
      setDragging(true);
      svgRef.current?.setPointerCapture(event.pointerId);
    }
    const width = svgRef.current?.getBoundingClientRect().width ?? 0;
    setViewport(
      panBy(current.start, -pixelsToCanvas(current.start, dx, width), -pixelsToCanvas(current.start, dy, width)),
    );
  }

  function onPointerEnd(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current) return;
    current.pointers.delete(event.pointerId);
    if (current.pointers.size > 0) {
      // Satu jari diangkat saat mencubit: lanjutkan sebagai geser dari posisi sekarang.
      const [rest] = [...current.pointers.values()];
      gesture.current = { ...current, start: viewport, origin: rest, pinchDistance: 0 };
      return;
    }
    if (current.moved) {
      suppressClick.current = true;
      // Klik dikirim setelah pointerup; lepas penanda di frame berikutnya.
      requestAnimationFrame(() => {
        suppressClick.current = false;
      });
    }
    gesture.current = null;
    setDragging(false);
  }

  /** Tombol keyboard di dalam peta; `true` bila tombolnya dipakai. */
  function onKeyDown(event: KeyboardEvent<HTMLElement>): boolean {
    const step = ARROW_STEP / viewport.scale;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    let next: Viewport | null = null;
    if (event.key === "+" || event.key === "=") next = zoomCenter(viewport, ZOOM_STEP);
    else if (event.key === "-" || event.key === "_") next = zoomCenter(viewport, 1 / ZOOM_STEP);
    else if (event.key === "0") next = INITIAL_VIEWPORT;
    else if (moves[event.key] && viewport.scale > 1) next = panBy(viewport, ...moves[event.key]);
    if (!next) return false;
    event.preventDefault();
    setViewport(next);
    return true;
  }

  return {
    svgRef,
    viewport,
    dragging,
    zoomIn: () => setViewport((current) => zoomCenter(current, ZOOM_STEP)),
    zoomOut: () => setViewport((current) => zoomCenter(current, 1 / ZOOM_STEP)),
    reset: () => setViewport(INITIAL_VIEWPORT),
    /** `true` bila klik barusan adalah akhir seretan, jadi harus diabaikan. */
    isDragClick: () => suppressClick.current,
    svgProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
    onKeyDown,
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
