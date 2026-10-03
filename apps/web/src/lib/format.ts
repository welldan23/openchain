/**
 * Utilitas format angka, persen, uang, waktu, dan hash untuk tampilan.
 *
 * Semua keluaran memakai format Indonesia (id-ID): koma untuk desimal,
 * titik untuk ribuan, dan singkatan rb/jt/M/T untuk angka ringkas.
 * Nilai yang tidak valid (NaN/Infinity/tanggal rusak) ditampilkan sebagai "–".
 */

export const LOCALE = "id-ID";
export const TIME_ZONE = "Asia/Jakarta";
export const TIME_ZONE_LABEL = "WIB";

/** Placeholder untuk nilai yang tidak bisa ditampilkan. */
export const EMPTY_VALUE = "–";

/** Spasi tak terputus agar angka dan satuannya tidak terpisah baris. */
const NBSP = " ";

const integerFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const compactFormat = new Intl.NumberFormat(LOCALE, {
  notation: "compact",
  maximumFractionDigits: 2,
});

const usdFormat = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD" });

const usdCompactFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const usdSmallPriceFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 4,
});

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const relativeTimeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

function isValidNumber(value: number): boolean {
  return Number.isFinite(value);
}

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ------------------------------- Angka ---------------------------------- */

/** 23.512.880 — angka penuh dengan pemisah ribuan. */
export function formatNumber(value: number, maximumFractionDigits = 0): string {
  if (!isValidNumber(value)) return EMPTY_VALUE;
  if (maximumFractionDigits === 0) return integerFormat.format(value);
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

/** 1,25 jt — angka ringkas (rb = ribu, jt = juta, M = miliar, T = triliun). */
export function formatNumberCompact(value: number): string {
  if (!isValidNumber(value)) return EMPTY_VALUE;
  return compactFormat.format(value);
}

/** 1,25 jt NBLA — jumlah token beserta simbolnya. */
export function formatTokenAmount(
  amount: number,
  symbol: string,
  { compact = true }: { compact?: boolean } = {},
): string {
  if (!isValidNumber(amount)) return EMPTY_VALUE;
  const number = compact ? formatNumberCompact(amount) : formatNumber(amount, 2);
  return `${number}${NBSP}${symbol}`;
}

/* -------------------------------- Uang ---------------------------------- */

/** US$5.266,25 — nilai USD lengkap. */
export function formatUsd(value: number): string {
  if (!isValidNumber(value)) return EMPTY_VALUE;
  return usdFormat.format(value);
}

/** US$4,21 jt — nilai USD ringkas tanpa nol desimal yang tidak perlu. */
export function formatUsdCompact(value: number): string {
  if (!isValidNumber(value)) return EMPTY_VALUE;
  return usdCompactFormat.format(value);
}

/**
 * Harga token. Harga ≥ $1 memakai 2 desimal; harga kecil memakai 4 digit
 * signifikan supaya US$0,004213 tidak tampil sebagai US$0,00.
 */
export function formatUsdPrice(value: number): string {
  if (!isValidNumber(value)) return EMPTY_VALUE;
  if (Math.abs(value) >= 1 || value === 0) return usdFormat.format(value);
  return usdSmallPriceFormat.format(value);
}

/* ------------------------------- Persen --------------------------------- */

interface PctOptions {
  /** Jumlah desimal maksimum (default 2). */
  maximumFractionDigits?: number;
}

/**
 * 18,4% — persen dari nilai dalam satuan persen (18.4 berarti 18,4%).
 * Nilai positif yang terlalu kecil untuk ditampilkan menjadi "<0,01%"
 * agar tidak terbaca sebagai nol.
 */
export function formatPct(value: number, { maximumFractionDigits = 2 }: PctOptions = {}): string {
  if (!isValidNumber(value)) return EMPTY_VALUE;
  const smallest = 10 ** -maximumFractionDigits;
  if (value > 0 && value < smallest) {
    return `<${new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits }).format(smallest / 100)}`;
  }
  return new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits }).format(
    value / 100,
  );
}

/** +12,4% / -8,7% — perubahan persen dengan tanda, nol tanpa tanda. */
export function formatPctChange(
  value: number,
  { maximumFractionDigits = 2 }: PctOptions = {},
): string {
  if (!isValidNumber(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    maximumFractionDigits,
    signDisplay: "exceptZero",
  }).format(value / 100);
}

/* ------------------------------- Waktu ---------------------------------- */

/** 03 Okt 2026, 11.30 WIB */
export function formatDateTime(iso: string): string {
  const date = parseDate(iso);
  if (!date) return EMPTY_VALUE;
  return `${dateTimeFormat.format(date)} ${TIME_ZONE_LABEL}`;
}

/** 03 Okt 2026 */
export function formatDate(iso: string): string {
  const date = parseDate(iso);
  if (!date) return EMPTY_VALUE;
  return dateFormat.format(date);
}

/**
 * Lama waktu dari `fromIso` sampai `toIso`, mis. "20 hari". Dipakai untuk umur
 * token relatif terhadap waktu snapshot, supaya hasilnya bisa direproduksi.
 */
export function formatAge(fromIso: string, toIso: string): string {
  const from = parseDate(fromIso);
  const to = parseDate(toIso);
  if (!from || !to) return EMPTY_VALUE;
  const minutes = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} jam`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} hari`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} bulan`;
  return `${Math.floor(months / 12)} tahun`;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** "1 jam yang lalu" — jarak waktu dari `iso` ke `now`. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = parseDate(iso);
  if (!date || Number.isNaN(now.getTime())) return EMPTY_VALUE;
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) >= seconds) {
      return relativeTimeFormat.format(Math.trunc(diffSeconds / seconds), unit);
    }
  }
  return "baru saja";
}

/* ------------------------------- Hash ----------------------------------- */

/** 0x1234…abcd — memendekkan address/hash panjang. */
export function shortenHash(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
