"use client";

import { useThemeSync } from "@/lib/theme-store";

/** Menjaga `<html data-theme>` sesuai pilihan tema di semua halaman. */
export function ThemeSync() {
  useThemeSync();
  return null;
}
