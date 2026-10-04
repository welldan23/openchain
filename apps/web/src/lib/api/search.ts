/**
 * Pencarian cepat dan riwayat investigasi.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `GET /search?q=` → `SearchResponse` dan `GET /investigations` →
 * `InvestigationEntry[]`) tanpa mengubah komponen yang memakainya.
 */
import { MOCK_FAILING_QUERY, MOCK_HISTORY, MOCK_SEARCH_EXAMPLES, MOCK_SEARCH_INDEX } from "../mock/search";
import { validateNote } from "../history";
import { classifyQuery, dedupeResults, normalizeText } from "../search";
import { EMPTY_SEARCH_FILTERS, searchFilterHref } from "../search-filter";
import type { InvestigationEntry, SearchQueryKind, SearchResult } from "../types";

const MOCK_LATENCY_MS = 400;
const SUGGEST_LATENCY_MS = 150;
const SAVE_LATENCY_MS = 300;
const RECORD_LATENCY_MS = 150;
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

/** Pencocokan atas indeks tiruan; dipakai bersama oleh pencarian penuh dan saran. */
function runMockSearch(rawQuery: string): SearchResponse {
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

/**
 * Cari token, address, atau transaksi. Address EVM dan hash EVM dicocokkan
 * tanpa peduli huruf besar/kecil; address dan signature Solana harus persis.
 */
export async function searchInvestigations(rawQuery: string): Promise<SearchResponse> {
  await delay(MOCK_LATENCY_MS);
  return runMockSearch(rawQuery);
}

export interface SearchSuggestions extends SearchResponse {
  /** Jumlah semua hasil; bisa lebih banyak dari `results` yang dipotong. */
  total: number;
}

export const SUGGESTION_LIMIT = 6;

/**
 * Saran singkat untuk kolom pencarian (asumsi kontrak:
 * `GET /search/suggest?q=&limit=` → `SearchSuggestions`). Lebih cepat dari
 * pencarian penuh dan hanya mengembalikan beberapa hasil teratas.
 */
export async function suggestSearch(rawQuery: string, limit = SUGGESTION_LIMIT): Promise<SearchSuggestions> {
  await delay(SUGGEST_LATENCY_MS);
  const response = runMockSearch(rawQuery);
  return { ...response, results: response.results.slice(0, limit), total: response.results.length };
}

/** Investigasi yang pernah dibuka, terbaru dulu. */
export async function listInvestigationHistory(): Promise<InvestigationEntry[]> {
  return [...MOCK_HISTORY].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
}

/** Isi catatan yang sengaja membuat penyimpanan tiruan gagal, untuk mencoba tampilan error. */
export const MOCK_FAILING_NOTE = "#gagal";

/**
 * Simpan atau hapus catatan satu investigasi (asumsi kontrak:
 * `PATCH /investigations/:id` dengan body `{ note }` → `InvestigationEntry`;
 * `note` kosong menghapus catatan). Versi tiruan tidak menyimpan permanen.
 */
export async function saveInvestigationNote(id: string, rawNote: string): Promise<InvestigationEntry> {
  await delay(SAVE_LATENCY_MS);
  const validation = validateNote(rawNote);
  if (!validation.ok) throw new Error(validation.error);
  if (validation.note?.includes(MOCK_FAILING_NOTE)) {
    throw new Error("Simulasi: catatan gagal disimpan karena layanan tidak bisa dihubungi.");
  }
  const entry = MOCK_HISTORY.find((item) => item.id === id);
  if (!entry) throw new Error("Investigasi ini tidak ada lagi di riwayat.");
  return { ...entry, note: validation.note };
}

/** Item riwayat tiruan yang sengaja gagal dihapus, untuk mencoba tampilan error. */
export const MOCK_UNDELETABLE_HISTORY_ID = "hist-5";

/**
 * Hapus satu investigasi dari riwayat beserta catatannya (asumsi kontrak:
 * `DELETE /investigations/:id` → 204). Hanya riwayatnya yang hilang; data
 * on-chain dan halaman investigasinya tetap bisa dibuka lagi.
 */
export async function deleteInvestigation(id: string): Promise<void> {
  await delay(SAVE_LATENCY_MS);
  if (id === MOCK_UNDELETABLE_HISTORY_ID) {
    throw new Error("Simulasi: item ini gagal dihapus karena layanan tidak bisa dihubungi.");
  }
  if (!MOCK_HISTORY.some((item) => item.id === id)) throw new Error("Investigasi ini sudah tidak ada di riwayat.");
}

export type NewInvestigationEntry = Omit<InvestigationEntry, "id" | "openedAt">;

/**
 * Catat investigasi yang dibuka dari pencarian (asumsi kontrak:
 * `POST /investigations` dengan `NewInvestigationEntry` → `InvestigationEntry`;
 * server memakai waktu dan id-nya sendiri, dan membuka ulang halaman yang sama
 * cukup memperbarui waktunya). Versi tiruan tidak menyimpan permanen.
 */
export async function recordInvestigation(input: NewInvestigationEntry): Promise<InvestigationEntry> {
  // Waktu dibuka = saat user memilih, bukan saat jawaban server tiba.
  const openedAt = new Date().toISOString();
  await delay(RECORD_LATENCY_MS);
  if (!/^\/(token|flow|trace|map|multichain)\//.test(input.href)) {
    throw new Error("Hanya halaman investigasi yang dicatat di riwayat.");
  }
  const existing = MOCK_HISTORY.find((item) => item.href === input.href);
  return existing ? { ...existing, openedAt } : { ...input, id: `rekam-${Date.parse(openedAt)}`, openedAt };
}

/** Contoh isian yang bisa dicoba saat kotak cari masih kosong. */
export function listSearchExamples(): Array<{ label: string; query: string }> {
  return MOCK_SEARCH_EXAMPLES;
}

/** Tautan halaman cari tanpa filter; filter ditulis lewat `searchFilterHref`. */
export function searchPath(query: string): string {
  return searchFilterHref(query, EMPTY_SEARCH_FILTERS);
}

export function searchFailureDemoPath(): string {
  return searchPath(MOCK_FAILING_QUERY);
}
