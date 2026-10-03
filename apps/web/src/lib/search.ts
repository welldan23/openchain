/**
 * Logika pencarian cepat: mengenali jenis isian (address, hash transaksi,
 * atau teks) dan mencocokkannya dengan data yang ada.
 */
import type { SearchQueryKind, SearchResult } from "./types";

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
