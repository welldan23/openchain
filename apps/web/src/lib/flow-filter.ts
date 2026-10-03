/**
 * Filter rentang waktu halaman Lacak Aliran Dana, dibaca dari query URL
 * (`?rentang=7h` atau `?dari=2026-09-12&sampai=2026-09-20`) supaya hasil
 * filter bisa dibagikan lewat tautan.
 *
 * Rentang dihitung mundur dari akhir periode data (waktu snapshot), bukan
 * dari jam sekarang, supaya hasilnya sama setiap kali tautan dibuka.
 */
import { formatDate, TIME_ZONE_LABEL } from "./format";
import type { ChainId, FlowTransfer } from "./types";

export type RangePreset = "24j" | "7h" | "30h" | "semua";

const HOUR_MS = 60 * 60 * 1000;

export const RANGE_PRESETS: ReadonlyArray<{ id: RangePreset; label: string; ms: number | null }> = [
  { id: "24j", label: "24 jam", ms: 24 * HOUR_MS },
  { id: "7h", label: "7 hari", ms: 7 * 24 * HOUR_MS },
  { id: "30h", label: "30 hari", ms: 30 * 24 * HOUR_MS },
  { id: "semua", label: "Semua", ms: null },
];

/** Offset WIB untuk mengubah tanggal pilihan user menjadi waktu. */
const WIB_OFFSET = "+07:00";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface FlowFilterParams {
  rentang?: string;
  dari?: string;
  sampai?: string;
}

export interface FlowTimeFilter {
  /** Preset yang aktif; `null` bila memakai tanggal pilihan sendiri. */
  preset: RangePreset | null;
  from: string;
  to: string;
  /** Tanggal pilihan sendiri (YYYY-MM-DD) untuk mengisi ulang form. */
  customFrom?: string;
  customTo?: string;
  /** Pesan bila input filter tidak bisa dipakai dan diganti "Semua". */
  notice?: string;
}

/** Ambil nilai pertama dari query Next.js (`string | string[] | undefined`). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDay(value: string, endOfDay: boolean): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const time = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}${WIB_OFFSET}`);
  // Tolak tanggal yang "digeser" Date, mis. 2026-02-31.
  if (Number.isNaN(time) || new Date(time + 7 * HOUR_MS).toISOString().slice(0, 10) !== value) return null;
  return time;
}

function clamp(time: number, min: number, max: number): number {
  return Math.min(Math.max(time, min), max);
}

/**
 * Rentang waktu efektif dari query URL, selalu di dalam periode data.
 * Input yang tidak valid diganti "Semua" beserta pesan penjelasannya.
 */
export function resolveTimeFilter(params: FlowFilterParams, window: { from: string; to: string }): FlowTimeFilter {
  const windowFrom = Date.parse(window.from);
  const windowTo = Date.parse(window.to);
  const all: FlowTimeFilter = { preset: "semua", from: window.from, to: window.to };

  if (params.dari || params.sampai) {
    const from = params.dari ? parseDay(params.dari, false) : windowFrom;
    const to = params.sampai ? parseDay(params.sampai, true) : windowTo;
    if (from === null || to === null) {
      return { ...all, notice: "Format tanggal tidak dikenali, jadi semua transfer ditampilkan." };
    }
    if (from > to) {
      return { ...all, notice: "Tanggal awal ada setelah tanggal akhir, jadi semua transfer ditampilkan." };
    }
    return {
      preset: null,
      from: new Date(clamp(from, windowFrom, windowTo)).toISOString(),
      to: new Date(clamp(to, windowFrom, windowTo)).toISOString(),
      customFrom: params.dari,
      customTo: params.sampai,
    };
  }

  const preset = RANGE_PRESETS.find((item) => item.id === params.rentang);
  if (!preset) {
    return params.rentang ? { ...all, notice: "Pilihan rentang tidak dikenali, jadi semua transfer ditampilkan." } : all;
  }
  if (preset.ms === null) return all;
  return {
    preset: preset.id,
    from: new Date(Math.max(windowFrom, windowTo - preset.ms)).toISOString(),
    to: window.to,
  };
}

/** Transfer di dalam rentang waktu, batas awal dan akhir ikut. */
export function filterByTime(transfers: FlowTransfer[], filter: Pick<FlowTimeFilter, "from" | "to">): FlowTransfer[] {
  const from = Date.parse(filter.from);
  const to = Date.parse(filter.to);
  return transfers.filter((transfer) => {
    const time = Date.parse(transfer.timestamp);
    return time >= from && time <= to;
  });
}

/** "12 Sep 2026 – 03 Okt 2026" untuk ditampilkan di header. */
export function describeRange(filter: Pick<FlowTimeFilter, "from" | "to">): string {
  return `${formatDate(filter.from)} – ${formatDate(filter.to)} (${TIME_ZONE_LABEL})`;
}

/** Tautan halaman aliran dana dengan filter tertentu; parameter kosong tidak ditulis. */
export function flowFilterHref(chain: ChainId, address: string, params: FlowFilterParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return `/flow/${chain}/${address}${text ? `?${text}` : ""}`;
}

/** Tanggal WIB (YYYY-MM-DD) untuk nilai `min`/`max` input tanggal. */
export function wibDateValue(iso: string): string {
  return new Date(Date.parse(iso) + 7 * HOUR_MS).toISOString().slice(0, 10);
}
