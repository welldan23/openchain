const LOCALE = "id-ID";
const TIME_ZONE = "Asia/Jakarta";

const usdCompact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const numberCompact = new Intl.NumberFormat(LOCALE, {
  notation: "compact",
  maximumFractionDigits: 2,
});

const numberFull = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** $1,2 jt — nilai USD ringkas. */
export function formatUsdCompact(value: number): string {
  return usdCompact.format(value);
}

/** Harga token kecil butuh digit signifikan, bukan desimal tetap. */
export function formatUsdPrice(value: number): string {
  if (value === 0) return "$0";
  const digits = value >= 1 ? 2 : 4;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "USD",
    ...(value >= 1
      ? { maximumFractionDigits: digits }
      : { maximumSignificantDigits: digits }),
  }).format(value);
}

export function formatNumberCompact(value: number): string {
  return numberCompact.format(value);
}

export function formatNumber(value: number): string {
  return numberFull.format(value);
}

/** +4,20% / -1,05% */
export function formatPctChange(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString(LOCALE, { maximumFractionDigits: 2 })}%`;
}

export function formatPct(value: number): string {
  return `${value.toLocaleString(LOCALE, { maximumFractionDigits: 2 })}%`;
}

/** 03 Okt 2026 11.30 WIB */
export function formatDateTime(iso: string): string {
  return `${dateTime.format(new Date(iso))} WIB`;
}

export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso));
}

/** 0x1234…abcd — memendekkan address/hash panjang. */
export function shortenHash(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Umur sejak `fromIso` relatif terhadap `toIso` (mis. waktu snapshot),
 * supaya hasilnya stabil dan bisa direproduksi.
 */
export function formatAge(fromIso: string, toIso: string): string {
  const diffMs = new Date(toIso).getTime() - new Date(fromIso).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} jam`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} hari`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} bulan`;
  return `${Math.floor(months / 12)} tahun`;
}
