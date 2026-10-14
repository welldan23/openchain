/**
 * Format angka, waktu, dan satuan nilai sesuai preferensi tampilan, murni.
 * Dipakai pratinjau di Pengaturan → Tampilan. Halaman lain masih memakai
 * format bawaan di `format.ts` (Indonesia, WIB, USD) sampai preferensi
 * tersimpan di akun dan bisa dibaca saat halaman dirender.
 */
import type { DisplayPreferences, NumberLocale } from "./types";

export type FormatPreferences = Pick<DisplayPreferences, "numberLocale" | "timeDisplay" | "compactNumbers" | "valueUnit">;

const INTL_LOCALE: Record<NumberLocale, string> = { id: "id-ID", en: "en-US" };

/** Singkatan zona waktu Indonesia; zona lain memakai singkatan dari Intl (mis. GMT+9). */
const ZONE_LABEL: Record<string, string> = { "Asia/Jakarta": "WIB", "Asia/Pontianak": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };

export function timeZoneOf(preferences: Pick<FormatPreferences, "timeDisplay">, profileTimeZone: string): string {
  return preferences.timeDisplay === "utc" ? "UTC" : profileTimeZone;
}

export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  if (timeZone === "UTC") return "UTC";
  if (ZONE_LABEL[timeZone]) return ZONE_LABEL[timeZone];
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(at).find((item) => item.type === "timeZoneName");
  return part?.value ?? timeZone;
}

export function formatAmount(value: number, preferences: Pick<FormatPreferences, "numberLocale" | "compactNumbers">, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat(INTL_LOCALE[preferences.numberLocale], {
    notation: preferences.compactNumbers ? "compact" : "standard",
    maximumFractionDigits,
  }).format(value);
}

/**
 * Nilai transfer dalam satuan pilihan. Untuk koin native dibutuhkan jumlah
 * native-nya; bila tidak ada (mis. transfer token), nilai USD yang dipakai
 * dan ditandai supaya tidak dikira jumlah koin.
 */
export function formatValue(
  value: { usd: number | null; native: { amount: number; symbol: string } | null },
  preferences: Pick<FormatPreferences, "numberLocale" | "compactNumbers" | "valueUnit">,
): string {
  if (preferences.valueUnit === "native" && value.native) {
    return `${formatAmount(value.native.amount, { ...preferences, compactNumbers: false }, 6)} ${value.native.symbol}`;
  }
  if (value.usd === null) return "–";
  const usd = new Intl.NumberFormat(INTL_LOCALE[preferences.numberLocale], {
    style: "currency",
    currency: "USD",
    notation: preferences.compactNumbers ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value.usd);
  return preferences.valueUnit === "native" ? `${usd} (tanpa jumlah koin native)` : usd;
}

export function formatDateTimeIn(iso: string, preferences: Pick<FormatPreferences, "numberLocale" | "timeDisplay">, profileTimeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  const timeZone = timeZoneOf(preferences, profileTimeZone);
  const text = new Intl.DateTimeFormat(INTL_LOCALE[preferences.numberLocale], {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${text} ${timeZoneLabel(timeZone, date)}`;
}

/** Contoh nilai tetap untuk pratinjau, supaya hasilnya bisa dibandingkan antar pilihan. */
export const PREVIEW_SAMPLE = {
  holders: 1_234_567,
  liquidityUsd: 612_400.5,
  transfer: { usd: 4_215.3, native: { amount: 1.5, symbol: "ETH" } },
  tokenTransfer: { usd: 980.25, native: null },
  at: "2026-10-03T04:30:00.000Z",
} as const;
