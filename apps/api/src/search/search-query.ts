/** Logika pencarian yang tidak butuh database: mengenali input, kueri teks, filter, dan facet. */
import type { ResultKindFilter, SearchFacets, SearchFilters, SearchQueryKind, SearchResultView } from './search.types.js';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX = /^0x[0-9a-fA-F]{64}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
/** Teks lebih pendek dari ini terlalu umum untuk dicari sebagian. */
export const MIN_TEXT_QUERY = 2;

export function classifyQuery(raw: string): SearchQueryKind {
  const query = raw.trim();
  if (query === '') return 'empty';
  if (EVM_ADDRESS.test(query)) return 'evm_address';
  if (EVM_TX.test(query)) return 'evm_tx';
  if (BASE58.test(query) && query.length >= 32 && query.length <= 44) return 'solana_address';
  if (BASE58.test(query) && query.length >= 64 && query.length <= 90) return 'solana_tx';
  return 'text';
}

/** Teks dinormalkan: huruf kecil, spasi rapat. */
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Kueri `to_tsquery('simple', …)` untuk teks bebas: setiap potongan huruf/angka
 * jadi awalan kata, digabung "dan". Karakter khusus tsquery tidak pernah lolos.
 * `null` bila tidak ada potongan yang cukup panjang.
 */
export function textTsQuery(raw: string): string | null {
  const terms = normalizeText(raw)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0);
  if (terms.join('').length < MIN_TEXT_QUERY) return null;
  return terms.map((term) => `${term}:*`).join(' & ');
}

export function resultLabelKey(result: SearchResultView): string {
  return result.label?.type ?? 'none';
}

type Dimension = 'kind' | 'chain' | 'label';

function matches(result: SearchResultView, filters: SearchFilters, skip?: Dimension): boolean {
  if (skip !== 'kind' && filters.kind !== 'all' && result.kind !== filters.kind) return false;
  if (skip !== 'chain' && filters.chains.length > 0 && !result.chains.some((chain) => filters.chains.includes(chain))) return false;
  if (skip !== 'label') {
    if (filters.labels.length > 0 && !filters.labels.includes(resultLabelKey(result))) return false;
    // Hasil tanpa label tidak punya sumber, jadi ikut tersaring saat sumber dipilih.
    if (filters.labelSource !== 'all' && result.label?.source !== filters.labelSource) return false;
  }
  return true;
}

export function applyFilters(results: readonly SearchResultView[], filters: SearchFilters): SearchResultView[] {
  return results.filter((result) => matches(result, filters));
}

/** Pilihan dari semua hasil (supaya pilihan aktif tidak hilang); jumlah dengan filter dimensi lain tetap berlaku. */
export function searchFacets(results: readonly SearchResultView[], filters: SearchFilters, chainOrder: readonly string[]): SearchFacets {
  const byKind = results.filter((result) => matches(result, filters, 'kind'));
  const kinds: Record<ResultKindFilter, number> = { all: byKind.length, token: 0, address: 0, transaction: 0 };
  for (const result of byKind) kinds[result.kind] += 1;

  const byChain = results.filter((result) => matches(result, filters, 'chain'));
  const present = new Set(results.flatMap((result) => result.chains));
  const rank = (chain: string) => (chainOrder.includes(chain) ? chainOrder.indexOf(chain) : chainOrder.length);
  const chains = [...present]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((chain) => ({ chain, count: byChain.filter((result) => result.chains.includes(chain)).length }));

  const byLabel = results.filter((result) => matches(result, filters, 'label'));
  const keys = [...new Set(results.map(resultLabelKey))].sort((a, b) => Number(a === 'none') - Number(b === 'none') || a.localeCompare(b));
  const labels = keys.map((key) => ({
    key,
    count: byLabel.filter((result) => resultLabelKey(result) === key && (filters.labelSource === 'all' || result.label?.source === filters.labelSource)).length,
  }));
  const typed = byLabel.filter((result) => filters.labels.length === 0 || filters.labels.includes(resultLabelKey(result)));
  return {
    kinds,
    chains,
    labels,
    sources: {
      all: typed.length,
      external: typed.filter((result) => result.label?.source === 'external').length,
      heuristic: typed.filter((result) => result.label?.source === 'heuristic').length,
    },
  };
}

const KIND_ORDER: Record<SearchResultView['kind'], number> = { token: 0, address: 1, transaction: 2 };

/** Satu hasil per href; urut token, address, lalu transaksi, urutan dalam jenis dipertahankan. */
export function dedupeResults(results: readonly SearchResultView[]): SearchResultView[] {
  const seen = new Set<string>();
  const unique = results.filter((result) => (seen.has(result.href) ? false : (seen.add(result.href), true)));
  return unique.map((result, index) => ({ result, index })).sort((a, b) => KIND_ORDER[a.result.kind] - KIND_ORDER[b.result.kind] || a.index - b.index).map((item) => item.result);
}
