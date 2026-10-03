"use client";

import { useEffect, useRef, useState } from "react";
import type { FocusEvent, PointerEvent } from "react";

const VIEWPORT_MARGIN = 8;

/**
 * Popover kecil untuk badge: terbuka saat di-tap/klik (tersemat), di-hover
 * mouse, atau difokus keyboard. Tutup saat tap di luar atau menekan Escape.
 * Rata kanan bila popover selebar `width` akan terpotong di tepi layar.
 */
export function usePopover<T extends HTMLElement>(width: number) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<T>(null);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const open = pinned || hovered || keyboardFocused;

  function updateAlignment() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAlignEnd(rect.left + width > window.innerWidth - VIEWPORT_MARGIN);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: globalThis.PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setHovered(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPinned(false);
        setHovered(false);
        setKeyboardFocused(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const triggerProps = {
    "aria-expanded": open,
    onClick: () => {
      updateAlignment();
      setPinned((value) => !value);
    },
    onPointerEnter: (event: PointerEvent<T>) => {
      if (event.pointerType !== "mouse") return;
      updateAlignment();
      setHovered(true);
    },
    onPointerLeave: (event: PointerEvent<T>) => {
      if (event.pointerType === "mouse") setHovered(false);
    },
    onFocus: (event: FocusEvent<T>) => {
      if (!event.currentTarget.matches(":focus-visible")) return;
      updateAlignment();
      setKeyboardFocused(true);
    },
    onBlur: () => setKeyboardFocused(false),
  };

  return { rootRef, triggerRef, open, alignEnd, triggerProps };
}
