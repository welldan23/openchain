/**
 * Kontrak respons `GET /api/search`. Hasil menunjuk halaman investigasi;
 * ringkasan (`meta`) yang kosong berarti datanya belum ada, bukan nol.
 */
import type { RiskLevel } from '../database/schema/enums.js';
import type { FlowLabelView } from '../flows/flow-summary.types.js';

export type SearchQueryKind = 'empty' | 'evm_address' | 'solana_address' | 'evm_tx' | 'solana_tx' | 'text';
export type SearchResultKind = 'token' | 'address' | 'transaction';

export type SearchResultMeta =
  | {
      kind: 'token';
      riskLevel: RiskLevel | null;
      findingCount: number | null;
      holderCount: number | null;
      priceUsd: number | null;
      liquidityUsd: number | null;
      /** Waktu snapshot yang dipakai ringkasan ini; `null` bila belum ada snapshot. */
      snapshotAt: string | null;
    }
  | {
      kind: 'address';
      /** Halaman tujuan: aliran dana satu chain atau jelajah multichain. */
      view: 'flow' | 'multichain';
      /** Chain tempat riwayat address ini sudah dipindai. */
      scannedChains: string[];
    }
  | {
      kind: 'transaction';
      timestamp: string;
      blockNumber: number;
      /** Perpindahan dana tersimpan di transaksi ini. */
      movementCount: number;
    };

export interface SearchResultView {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string | null;
  /** `null` untuk hasil multichain. */
  chain: string | null;
  /** Jaringan hasil ini; lebih dari satu untuk address multichain. */
  chains: string[];
  /** Label utama (eksternal dulu) beserta sumbernya. */
  label: FlowLabelView | null;
  href: string;
  /** Kenapa hasil ini cocok, mis. "Nama persis" atau "Address persis". */
  matchedBy: string;
  meta: SearchResultMeta | null;
}

export type LabelSourceFilter = 'all' | 'external' | 'heuristic';
export type ResultKindFilter = 'all' | SearchResultKind;

export interface SearchFilters {
  kind: ResultKindFilter;
  chains: string[];
  /** Jenis label utama; `none` = tanpa label. */
  labels: string[];
  labelSource: LabelSourceFilter;
}

export interface SearchFacets {
  kinds: Record<ResultKindFilter, number>;
  chains: Array<{ chain: string; count: number }>;
  labels: Array<{ key: string; count: number }>;
  sources: Record<LabelSourceFilter, number>;
}

export interface SearchResponse {
  query: string;
  queryKind: SearchQueryKind;
  filters: SearchFilters;
  /** Hasil setelah filter, paling banyak `limit`. */
  results: SearchResultView[];
  /** Jumlah hasil setelah filter, sebelum dibatasi `limit`. */
  total: number;
  limit: number;
  /** Pilihan filter beserta jumlahnya; jumlah dihitung dengan filter dimensi lain tetap berlaku. */
  facets: SearchFacets;
  caveats: string[];
}
