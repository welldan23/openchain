/**
 * Pencarian cepat dan riwayat investigasi.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `GET /search?q=` → `SearchResponse` dan `GET /investigations` →
 * `InvestigationEntry[]`) tanpa mengubah komponen yang memakainya.
 */
import { MOCK_FAILING_QUERY, MOCK_HISTORY, MOCK_SEARCH_EXAMPLES, MOCK_SEARCH_INDEX } from "../mock/search";
import { classifyQuery, dedupeResults, normalizeText } from "../search";
import type { InvestigationEntry, SearchQueryKind, SearchResult } from "../types";

const MOCK_LATENCY_MS = 400;
/** Teks lebih pendek dari ini terlalu umum untuk dicari sebagian. */
export const MIN_TEXT_QUERY = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SearchResponse {
  query: string;
  kind: SearchQueryKind;
  results: SearchResult[];
}

/**
 * Cari token, address, atau transaksi. Address EVM dan hash EVM dicocokkan
 * tanpa peduli huruf besar/kecil; address dan signature Solana harus persis.
 */
export async function searchInvestigations(rawQuery: string): Promise<SearchResponse> {
  await delay(MOCK_LATENCY_MS);
  const query = rawQuery.trim();
  const kind = classifyQuery(query);
  if (query.toLowerCase() === MOCK_FAILING_QUERY.toLowerCase()) {
    throw new Error("Simulasi: layanan pencarian tidak bisa dihubungi.");
  }
  if (kind === "empty") return { query, kind, results: [] };

  if (kind === "text") {
    const needle = normalizeText(query);
    if (needle.length < MIN_TEXT_QUERY) return { query, kind, results: [] };
    const results = MOCK_SEARCH_INDEX.flatMap((entry) => {
      const hit = entry.text.find((text) => normalizeText(text).includes(needle));
      if (!hit) return [];
      const exactName = normalizeText(hit) === needle;
      return [{ ...entry.result, matchedBy: exactName ? `Nama persis "${hit}"` : `Nama mengandung "${query}"` }];
    });
    return { query, kind, results: dedupeResults(results) };
  }

  const caseInsensitive = kind === "evm_address" || kind === "evm_tx";
  const same = (a: string) => (caseInsensitive ? a.toLowerCase() === query.toLowerCase() : a === query);
  const matchedBy = kind.endsWith("_tx") ? "Hash transaksi persis" : "Address persis";
  const results = MOCK_SEARCH_INDEX.filter((entry) => entry.exact.some(same)).map((entry) => ({ ...entry.result, matchedBy }));
  return { query, kind, results: dedupeResults(results) };
}

/** Investigasi yang pernah dibuka, terbaru dulu. */
export async function listInvestigationHistory(): Promise<InvestigationEntry[]> {
  return [...MOCK_HISTORY].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
}

/** Contoh isian yang bisa dicoba saat kotak cari masih kosong. */
export function listSearchExamples(): Array<{ label: string; query: string }> {
  return MOCK_SEARCH_EXAMPLES;
}

export function searchPath(query: string): string {
  return query.trim() ? `/cari?q=${encodeURIComponent(query.trim())}` : "/cari";
}

export function searchFailureDemoPath(): string {
  return searchPath(MOCK_FAILING_QUERY);
}
