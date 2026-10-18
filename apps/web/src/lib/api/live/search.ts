/**
 * Pencarian (`/api/search`) dan riwayat investigasi (`/api/investigations`).
 * Ringkasan hasil hanya diisi bila backend memberi datanya; yang tidak ada
 * dibiarkan kosong, bukan nol. Riwayat milik akun yang sedang masuk.
 */
import type { InvestigationEntry, InvestigationKind, RiskLevel, SearchQueryKind, SearchResult, SearchResultKind } from "../../types";
import { ApiError, apiJson, seg } from "../http";
import { toChainId, toEntityLabel, type ApiLabel } from "./common";

/** Hasil maksimum per pencarian; filter jenis, chain, dan label diterapkan di halaman. */
const SEARCH_LIMIT = 100;

interface ApiSearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string | null;
  chain: string | null;
  label: ApiLabel | null;
  href: string;
  matchedBy: string;
  meta: { kind: "token"; riskLevel: RiskLevel | null; findingCount: number | null; holderCount: number | null; priceUsd: number | null; liquidityUsd: number | null } | { kind: "address" | "transaction" } | null;
}

export interface ApiSearchResponse {
  query: string;
  queryKind: SearchQueryKind;
  results: ApiSearchResult[];
  total: number;
}

export function toSearchResult(result: ApiSearchResult): SearchResult {
  const chain = toChainId(result.chain);
  const meta = result.meta;
  return {
    id: result.id,
    kind: result.kind,
    title: result.title,
    subtitle: result.subtitle ?? "",
    ...(chain ? { chain } : {}),
    label: toEntityLabel(result.label),
    href: result.href,
    matchedBy: result.matchedBy,
    // Ringkasan address dan transaksi dari backend belum memuat angka yang ditampilkan baris hasil, jadi tidak diisi.
    ...(meta?.kind === "token"
      ? {
          meta: {
            kind: "token" as const,
            riskLevel: meta.riskLevel ?? "unknown",
            findingCount: meta.findingCount ?? 0,
            verified: null,
            deployedAt: null,
            ...(meta.priceUsd === null ? {} : { priceUsd: meta.priceUsd }),
            ...(meta.liquidityUsd === null ? {} : { liquidityUsd: meta.liquidityUsd }),
            ...(meta.holderCount === null ? {} : { holderCount: meta.holderCount }),
          },
        }
      : {}),
  };
}

export async function search(query: string, limit = SEARCH_LIMIT): Promise<{ query: string; kind: SearchQueryKind; results: SearchResult[]; total: number }> {
  const response = await apiJson<ApiSearchResponse>("/search", { query: { q: query, limit } });
  return { query: response.query, kind: response.queryKind, results: response.results.map(toSearchResult), total: response.total };
}

export interface ApiInvestigationEntry {
  id: string;
  kind: InvestigationKind;
  title: string;
  chain: string | null;
  href: string;
  openedAt: string;
  note: string | null;
  findingCount: number | null;
}

export function toInvestigationEntry(entry: ApiInvestigationEntry): InvestigationEntry {
  const chain = toChainId(entry.chain);
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    ...(chain ? { chain } : {}),
    href: entry.href,
    openedAt: entry.openedAt,
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.findingCount === null ? {} : { findingCount: entry.findingCount }),
  };
}

/** Riwayat akun yang sedang masuk; tanpa sesi, riwayatnya memang kosong. */
export async function listHistory(): Promise<InvestigationEntry[]> {
  try {
    const response = await apiJson<{ entries: ApiInvestigationEntry[] }>("/investigations", { query: { limit: 200 } });
    return response.entries.map(toInvestigationEntry);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return [];
    throw error;
  }
}

export async function saveNote(id: string, note: string | null): Promise<InvestigationEntry> {
  return toInvestigationEntry(await apiJson<ApiInvestigationEntry>(`/investigations/${seg(id)}`, { method: "PATCH", body: { note: note ?? "" } }));
}

export async function deleteEntry(id: string): Promise<void> {
  await apiJson<void>(`/investigations/${seg(id)}`, { method: "DELETE" });
}

export async function recordEntry(input: Omit<InvestigationEntry, "id" | "openedAt">): Promise<InvestigationEntry> {
  return toInvestigationEntry(
    await apiJson<ApiInvestigationEntry>("/investigations", {
      method: "POST",
      body: { kind: input.kind, title: input.title, chain: input.chain ?? null, href: input.href, note: input.note ?? null, findingCount: input.findingCount ?? null },
    }),
  );
}
