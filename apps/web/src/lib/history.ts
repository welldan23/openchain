/**
 * Riwayat investigasi: pengelompokan per hari (tanggal WIB) dan aturan
 * catatan yang bisa ditulis user di tiap investigasi.
 */
import { wibDateValue } from "./flow-filter";
import { formatDayLong } from "./format";
import type { InvestigationEntry } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Id judul halaman riwayat; menerima fokus bila item terakhir dihapus. */
export const HISTORY_HEADING_ID = "riwayat-judul";

export interface HistoryDayGroup {
  /** Tanggal WIB, mis. "2026-10-03". */
  day: string;
  /** "Hari ini", "Kemarin", atau tanggal lengkap. */
  label: string;
  entries: InvestigationEntry[];
}

/** Kelompokkan per tanggal WIB, hari dan investigasi terbaru di atas. */
export function groupHistoryByDay(entries: InvestigationEntry[], now: Date): HistoryDayGroup[] {
  const today = wibDateValue(now.toISOString());
  const yesterday = wibDateValue(new Date(now.getTime() - DAY_MS).toISOString());
  const sorted = [...entries].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt) || a.id.localeCompare(b.id));
  const groups: HistoryDayGroup[] = [];
  for (const entry of sorted) {
    const day = wibDateValue(entry.openedAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) {
      last.entries.push(entry);
      continue;
    }
    const label = day === today ? "Hari ini" : day === yesterday ? "Kemarin" : formatDayLong(entry.openedAt);
    groups.push({ day, label, entries: [entry] });
  }
  return groups;
}

export const NOTE_MAX_LENGTH = 280;

export type NoteValidation = { ok: true; note: string | undefined } | { ok: false; error: string };

/**
 * Rapikan catatan sebelum disimpan: spasi di ujung dibuang, catatan kosong
 * berarti catatan dihapus. Catatan terlalu panjang ditolak, tidak dipotong
 * diam-diam.
 */
export function validateNote(raw: string): NoteValidation {
  const note = raw.trim();
  if (note.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `Catatan maksimal ${NOTE_MAX_LENGTH} karakter (sekarang ${note.length}).` };
  }
  return { ok: true, note: note === "" ? undefined : note };
}

/**
 * Item yang menerima fokus setelah `removedId` dihapus: item sesudahnya di
 * urutan tampil, atau sebelumnya bila yang dihapus item terakhir. `null`
 * bila daftar jadi kosong.
 */
export function focusTargetAfterRemoval(orderedIds: string[], removedId: string): string | null {
  const index = orderedIds.indexOf(removedId);
  if (index < 0) return null;
  return orderedIds[index + 1] ?? orderedIds[index - 1] ?? null;
}
