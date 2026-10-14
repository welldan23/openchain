"use client";

/**
 * Pilihan tema di browser ini, dibaca lewat `useSyncExternalStore`. Menerapkan
 * tema ke `<html data-theme>`, mengikuti perubahan tema perangkat saat
 * pilihannya "system", dan ikut berubah bila diganti di tab lain.
 */
import { useEffect, useSyncExternalStore } from "react";
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY, type ResolvedTheme } from "./theme";
import type { ThemePreference } from "./types";

const listeners = new Set<() => void>();
let memory: string | null = null;
const LIGHT_QUERY = "(prefers-color-scheme: light)";

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return memory;
  }
}

function snapshot(): ThemePreference {
  return parseThemePreference(readRaw());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference, window.matchMedia(LIGHT_QUERY).matches);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function setThemePreference(preference: ThemePreference): void {
  memory = preference;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Penyimpanan diblokir: tema tetap berlaku sampai halaman dimuat ulang.
  }
  applyTheme(preference);
  listeners.forEach((listener) => listener());
}

/** `undefined` selama render server dan hidrasi, lalu pilihan tema. */
export function useThemePreference(): ThemePreference | undefined {
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}

/** Terapkan pilihan tema dan, untuk "system", ikuti perubahan tema perangkat. */
export function useThemeSync(): void {
  const preference = useThemePreference();
  useEffect(() => {
    if (!preference) return;
    applyTheme(preference);
    if (preference !== "system") return;
    const query = window.matchMedia(LIGHT_QUERY);
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);
}
