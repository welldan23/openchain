/**
 * Logika pencarian cepat: mengenali jenis isian (address, hash transaksi,
 * atau teks) dan mencocokkannya dengan data yang ada.
 */
import { formatDateTime, formatNumber, formatRelativeTime, formatTokenAmount, formatUsdCompact, formatUsdPrice, shortenHash } from "./format";
import { addressTitle } from "./fund-flow";
import type { SearchQueryKind, SearchResult, SearchResultKind, SearchResultMeta } from "./types";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX = /^0x[0-9a-fA-F]{64}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Kenali jenis isian dari bentuknya; spasi di awal dan akhir diabaikan. */
export function classifyQuery(raw: string): SearchQueryKind {
  const query = raw.trim();
  if (query === "") return "empty";
  if (EVM_ADDRESS.test(query)) return "evm_address";
  if (EVM_TX.test(query)) return "evm_tx";
  if (BASE58.test(query) && query.length >= 32 && query.length <= 44) return "solana_address";
  if (BASE58.test(query) && query.length >= 64 && query.length <= 90) return "solana_tx";
  return "text";
}

export const QUERY_KIND_LABEL: Record<SearchQueryKind, string> = {
  empty: "Kosong",
  evm_address: "Address EVM",
  solana_address: "Address Solana",
  evm_tx: "Hash transaksi EVM",
  solana_tx: "Signature transaksi Solana",
  text: "Teks",
};

/** Teks dinormalkan untuk pencocokan: huruf kecil, spasi rapat. */
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Hasil unik per href, urut token, address, lalu transaksi; urutan dalam jenis dipertahankan. */
export function dedupeResults(results: SearchResult[]): SearchResult[] {
  const order = { token: 0, address: 1, transaction: 2 } as const;
  const seen = new Set<string>();
  return results
    .filter((result) => (seen.has(result.href) ? false : (seen.add(result.href), true)))
    .map((result, index) => ({ result, index }))
    .sort((a, b) => order[a.result.kind] - order[b.result.kind] || a.index - b.index)
    .map(({ result }) => result);
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Pecah `text` agar bagian yang cocok dengan `query` bisa ditebalkan. Hanya
 * kemunculan pertama, tanpa peduli huruf besar/kecil; spasi ganda di `query`
 * dianggap satu spasi.
 */
export function highlightMatch(text: string, query: string): HighlightPart[] {
  const needle = normalizeText(query);
  const start = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (start < 0) return [{ text, match: false }];
  const end = start + needle.length;
  return [
    { text: text.slice(0, start), match: false },
    { text: text.slice(start, end), match: true },
    { text: text.slice(end), match: false },
  ].filter((part) => part.text !== "");
}

/**
 * Pindah sorotan di daftar saran dengan panah. `-1` berarti belum ada yang
 * disorot; panah bawah mulai dari atas, panah atas mulai dari bawah, dan
 * sorotan berputar di kedua ujung.
 */
export function moveActiveIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}

export interface ResultMetaItem {
  id: string;
  label: string;
  value: string;
  /** Teks lengkap untuk tooltip, mis. tanggal persis atau address penuh. */
  title?: string;
}

const NO_DATA = "Belum ada data";

/**
 * Angka ringkas untuk baris hasil pencarian. Nilai yang belum ada ditulis
 * "Belum ada data", tidak diisi nol. Badge (risiko, arah, chain) digambar
 * terpisah oleh komponen.
 */
export function describeResultMeta(meta: SearchResultMeta, now: Date = new Date()): ResultMetaItem[] {
  if (meta.kind === "token") {
    const noMarket = meta.priceUsd === undefined && meta.liquidityUsd === undefined && meta.holderCount === undefined;
    return [
      ...(noMarket
        ? [{ id: "market", label: "Data pasar", value: NO_DATA }]
        : [
            { id: "price", label: "Harga", value: meta.priceUsd === undefined ? NO_DATA : formatUsdPrice(meta.priceUsd) },
            { id: "liquidity", label: "Likuiditas", value: meta.liquidityUsd === undefined ? NO_DATA : formatUsdCompact(meta.liquidityUsd) },
            { id: "holders", label: "Holder", value: meta.holderCount === undefined ? NO_DATA : formatNumber(meta.holderCount) },
          ]),
      { id: "findings", label: "Temuan risiko", value: formatNumber(meta.findingCount) },
      { id: "deployed", label: "Dibuat", value: formatRelativeTime(meta.deployedAt, now), title: formatDateTime(meta.deployedAt) },
    ];
  }
  if (meta.kind === "address") {
    return [
      { id: "tx", label: meta.view === "flow" ? "Transfer" : "Transaksi", value: formatNumber(meta.txCount) },
      { id: "in", label: "Masuk", value: meta.inUsd === undefined ? NO_DATA : formatUsdCompact(meta.inUsd) },
      { id: "out", label: "Keluar", value: meta.outUsd === undefined ? NO_DATA : formatUsdCompact(meta.outUsd) },
      meta.lastSeen
        ? { id: "last", label: "Aktif terakhir", value: formatRelativeTime(meta.lastSeen, now), title: formatDateTime(meta.lastSeen) }
        : { id: "last", label: "Aktif terakhir", value: NO_DATA },
    ];
  }
  return [
    { id: "amount", label: "Jumlah", value: formatTokenAmount(meta.amount, meta.assetSymbol) },
    { id: "value", label: "Nilai", value: meta.amountUsd === undefined ? "Harga tidak diketahui" : `±${formatUsdCompact(meta.amountUsd)}` },
    { id: "time", label: "Waktu", value: formatRelativeTime(meta.timestamp, now), title: formatDateTime(meta.timestamp) },
    {
      id: "counterparty",
      label: meta.direction === "in" ? "Dari" : "Ke",
      value: meta.counterpartyLabel ? addressTitle(meta.counterpartyLabel) : shortenHash(meta.counterparty),
      title: meta.counterparty,
    },
  ];
}

export type ResultKindFilter = "all" | SearchResultKind;

const RESULT_KIND_FILTERS: ResultKindFilter[] = ["all", "token", "address", "transaction"];

/** Baca filter jenis hasil dari URL (`?jenis=`); nilai asing dianggap semua. */
export function parseResultKindFilter(value: string | undefined): ResultKindFilter {
  return RESULT_KIND_FILTERS.find((filter) => filter === value) ?? "all";
}
