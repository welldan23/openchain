/** Halaman pengaturan: daftar tab dan ringkasan sumber data. */
import type { DataSourceSetting, DataSourceStatus } from "./types";

export type SettingsTabId = "profil" | "tampilan" | "sumber-data";

export const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string; href: `/pengaturan/${SettingsTabId}`; description: string }> = [
  { id: "profil", label: "Profil", href: "/pengaturan/profil", description: "Nama, email, zona waktu, dan isi yang tersimpan." },
  { id: "tampilan", label: "Tampilan", href: "/pengaturan/tampilan", description: "Tema, format angka dan waktu, serta chain bawaan." },
  { id: "sumber-data", label: "Sumber data", href: "/pengaturan/sumber-data", description: "Provider data per chain dan kondisinya." },
];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "profil";

/** Tab aktif dari path; path di luar tab yang dikenal tidak menandai tab mana pun. */
export function settingsTabFromPath(pathname: string): SettingsTabId | null {
  const segment = pathname.replace(/\/+$/, "").split("/")[2] ?? "";
  return SETTINGS_TABS.find((tab) => tab.id === segment)?.id ?? null;
}

/** Urutan tampil: yang bermasalah dulu supaya langsung terlihat. */
const STATUS_ORDER: DataSourceStatus[] = ["down", "degraded", "ok", "disabled", "not_integrated"];

export function sortDataSources(sources: DataSourceSetting[]): DataSourceSetting[] {
  return [...sources].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
}

export function dataSourceCounts(sources: DataSourceSetting[]): Record<DataSourceStatus, number> {
  const counts = { ok: 0, degraded: 0, down: 0, disabled: 0, not_integrated: 0 };
  for (const source of sources) counts[source.status] += 1;
  return counts;
}

/** Inisial untuk avatar, mis. "Rina Analis" → "RA". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

/** Nyalakan/matikan satu sumber di daftar (untuk tampilan langsung); sumber lain tidak berubah. */
export function withSourceEnabled(sources: DataSourceSetting[], id: string, enabled: boolean, statusWhenOn: DataSourceStatus): DataSourceSetting[] {
  return sources.map((source) => (source.id === id ? { ...source, enabled, status: enabled ? statusWhenOn : "disabled" } : source));
}

/** Sumber aktif yang datanya ikut analisis, per jenis; jenis tanpa sumber aktif berarti datanya tidak tersedia. */
export function inactiveKinds(sources: DataSourceSetting[]): DataSourceSetting["kind"][] {
  const kinds = [...new Set(sources.map((source) => source.kind))];
  return kinds.filter((kind) => !sources.some((source) => source.kind === kind && source.enabled));
}
