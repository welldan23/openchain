/**
 * Filter hasil pencarian: jenis hasil, jaringan, dan label entitas. Semua
 * pilihan disimpan di URL (`?jenis=&jaringan=&label=&sumber=`) supaya bisa
 * dibagikan, dan jumlah di tiap pilihan dihitung dengan filter lain tetap
 * berlaku, jadi angka di chip selalu sama dengan hasil setelah diklik.
 */
import { CHAINS, isChainId } from "./chains";
import { ENTITY_LABEL_META } from "./labels";
import type { ResultKindFilter } from "./search";
import { parseResultKindFilter } from "./search";
import type { ChainId, SearchResult } from "./types";
import type { LabelFilterKey, LabelSourceFilter } from "./wallet-map";

export interface SearchFilters {
  kind: ResultKindFilter;
  /** Kosong = semua jaringan. */
  chains: ChainId[];
  /** Kosong = semua label; `none` = hasil tanpa label. */
  labels: LabelFilterKey[];
  source: LabelSourceFilter;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = { kind: "all", chains: [], labels: [], source: "all" };

export interface SearchFilterParams {
  jenis?: string;
  jaringan?: string;
  label?: string;
  sumber?: string;
}

const SOURCE_PARAM: Record<Exclude<LabelSourceFilter, "all">, string> = { external: "eksternal", heuristic: "dugaan" };
const LABEL_KEYS = new Set<string>([...Object.keys(ENTITY_LABEL_META), "none"]);
const CHAIN_ORDER = Object.keys(CHAINS) as ChainId[];

function splitList(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
}

/** Baca filter dari URL; nilai yang tidak dikenal diabaikan. */
export function parseSearchFilters(params: SearchFilterParams): SearchFilters {
  const sourceEntry = Object.entries(SOURCE_PARAM).find(([, value]) => value === params.sumber);
  return {
    kind: parseResultKindFilter(params.jenis),
    chains: splitList(params.jaringan).filter(isChainId),
    labels: splitList(params.label).filter((item): item is LabelFilterKey => LABEL_KEYS.has(item)),
    source: sourceEntry ? (sourceEntry[0] as LabelSourceFilter) : "all",
  };
}

/** Tautan halaman cari dengan filter; parameter kosong tidak ditulis. */
export function searchFilterHref(query: string, filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (filters.kind !== "all") params.set("jenis", filters.kind);
  if (filters.chains.length > 0) params.set("jaringan", filters.chains.join(","));
  if (filters.labels.length > 0) params.set("label", filters.labels.join(","));
  if (filters.source !== "all") params.set("sumber", SOURCE_PARAM[filters.source]);
  const search = params.toString();
  return search ? `/cari?${search}` : "/cari";
}

export function isSearchFiltered(filters: SearchFilters): boolean {
  return filters.kind !== "all" || filters.chains.length > 0 || filters.labels.length > 0 || filters.source !== "all";
}

/** Tambah bila belum ada, buang bila sudah ada. */
export function toggleListItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

/** Jaringan tempat hasil ini berada; address multichain bisa lebih dari satu. */
export function resultChains(result: SearchResult): ChainId[] {
  if (result.chain) return [result.chain];
  return result.meta?.kind === "address" ? result.meta.activeChains : [];
}

export function resultLabelKey(result: SearchResult): LabelFilterKey {
  return result.label?.type ?? "none";
}

type Dimension = "kind" | "chain" | "label";

/** Cek semua filter kecuali `skip`, dipakai untuk menghitung jumlah per pilihan. */
function matches(result: SearchResult, filters: SearchFilters, skip?: Dimension): boolean {
  if (skip !== "kind" && filters.kind !== "all" && result.kind !== filters.kind) return false;
  if (skip !== "chain" && filters.chains.length > 0 && !resultChains(result).some((chain) => filters.chains.includes(chain))) {
    return false;
  }
  if (skip !== "label") {
    if (filters.labels.length > 0 && !filters.labels.includes(resultLabelKey(result))) return false;
    // Hasil tanpa label tidak punya sumber, jadi ikut tersaring saat sumber dipilih.
    if (filters.source !== "all" && result.label?.source !== filters.source) return false;
  }
  return true;
}

export function applySearchFilters(results: SearchResult[], filters: SearchFilters): SearchResult[] {
  return results.filter((result) => matches(result, filters));
}

export interface SearchFacets {
  kinds: Record<ResultKindFilter, number>;
  chains: Array<{ chain: ChainId; count: number }>;
  labels: Array<{ key: LabelFilterKey; count: number }>;
  sources: Record<LabelSourceFilter, number>;
}

/**
 * Pilihan yang tersedia beserta jumlahnya. Pilihan diambil dari semua hasil
 * (supaya pilihan yang sedang aktif tidak hilang), jumlahnya dihitung dengan
 * filter dimensi lain tetap berlaku.
 */
export function searchFacets(results: SearchResult[], filters: SearchFilters): SearchFacets {
  const byKind = results.filter((result) => matches(result, filters, "kind"));
  const kinds: Record<ResultKindFilter, number> = { all: byKind.length, token: 0, address: 0, transaction: 0 };
  for (const result of byKind) kinds[result.kind] += 1;

  const byChain = results.filter((result) => matches(result, filters, "chain"));
  const presentChains = new Set(results.flatMap(resultChains));
  const chains = CHAIN_ORDER.filter((chain) => presentChains.has(chain)).map((chain) => ({
    chain,
    count: byChain.filter((result) => resultChains(result).includes(chain)).length,
  }));

  const byLabel = results.filter((result) => matches(result, filters, "label"));
  const presentLabels = [...new Set(results.map(resultLabelKey))].sort(
    (a, b) => Number(a === "none") - Number(b === "none") || a.localeCompare(b),
  );
  const labels = presentLabels.map((key) => ({
    key,
    count: byLabel.filter(
      (result) => resultLabelKey(result) === key && (filters.source === "all" || result.label?.source === filters.source),
    ).length,
  }));
  const typed = byLabel.filter((result) => filters.labels.length === 0 || filters.labels.includes(resultLabelKey(result)));
  const sources: Record<LabelSourceFilter, number> = {
    all: typed.length,
    external: typed.filter((result) => result.label?.source === "external").length,
    heuristic: typed.filter((result) => result.label?.source === "heuristic").length,
  };
  return { kinds, chains, labels, sources };
}
