/**
 * Tema tampilan, murni. Pilihan disimpan per browser; "system" mengikuti
 * pengaturan perangkat. Tanpa pilihan tersimpan dipakai tema gelap, tampilan
 * bawaan OpenChain.
 */
import type { ThemePreference } from "./types";

export const THEME_STORAGE_KEY = "openchain.theme.v1";
export const DEFAULT_THEME: ThemePreference = "dark";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "dark", "light"];

export type ResolvedTheme = "dark" | "light";

export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return (THEME_PREFERENCES as readonly string[]).includes(raw ?? "") ? (raw as ThemePreference) : DEFAULT_THEME;
}

export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
  if (preference === "system") return prefersLight ? "light" : "dark";
  return preference;
}

/**
 * Skrip kecil yang dijalankan sebelum halaman tampil, supaya tema terang
 * tidak berkedip gelap dulu. Isinya statis (tanpa data pengguna).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(p!=="system"&&p!=="light"&&p!=="dark")p=${JSON.stringify(DEFAULT_THEME)};var t=p==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):p;document.documentElement.dataset.theme=t;}catch(e){}})();`;
