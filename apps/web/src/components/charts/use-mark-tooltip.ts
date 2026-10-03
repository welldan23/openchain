"use client";

import type { FocusEvent, MouseEvent, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface ActiveMark {
  id: string;
  /** Posisi tengah mark relatif ke kontainer (px). */
  x: number;
  /** Tepi atas mark relatif ke kontainer (px). */
  y: number;
}

/**
 * Tooltip per-mark untuk grafik: muncul saat mark di-hover (mouse), difokus
 * (keyboard), atau di-tap (sentuh). Tap/klik menyematkan tooltip sampai user
 * tap di luar grafik atau menekan Escape.
 */
export function useMarkTooltip<T extends HTMLElement>(tooltipWidth: number) {
  const containerRef = useRef<T>(null);
  const pinnedRef = useRef(false);
  const [active, setActive] = useState<ActiveMark | null>(null);

  function open(id: string, element: HTMLElement, pinned: boolean) {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const mark = element.getBoundingClientRect();
    const half = tooltipWidth / 2;
    const center = mark.left - box.left + mark.width / 2;
    // Jaga tooltip tetap di dalam lebar kontainer.
    const x = Math.min(Math.max(center, half), Math.max(half, box.width - half));
    pinnedRef.current = pinned;
    setActive({ id, x, y: mark.top - box.top });
  }

  function close() {
    pinnedRef.current = false;
    setActive(null);
  }

  useEffect(() => {
    if (!active) return;
    function handlePointerDown(event: globalThis.PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) close();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active]);

  /** Event handler untuk satu mark (segmen/baris) yang punya tooltip. */
  function markProps(id: string) {
    return {
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse") open(id, event.currentTarget, false);
      },
      onPointerLeave: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse" && !pinnedRef.current) close();
      },
      onClick: (event: MouseEvent<HTMLElement>) => {
        if (active?.id === id && pinnedRef.current) close();
        else open(id, event.currentTarget, true);
      },
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (event.currentTarget.matches(":focus-visible")) open(id, event.currentTarget, false);
      },
      onBlur: () => {
        if (!pinnedRef.current) close();
      },
    };
  }

  return { containerRef, active, markProps };
}
