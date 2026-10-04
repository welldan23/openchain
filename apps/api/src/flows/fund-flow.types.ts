/**
 * Hasil pengumpulan aliran dana satu address di satu chain, sebelum disimpan.
 * Kolektor tidak menulis ke database; `FundFlowIngestionService` yang
 * menyimpannya, sama seperti pola adapter token.
 */
import type { DataStatus } from '../database/schema/enums.js';
import type {
  ExternalLabel,
  IndexedNativeTransfer,
  IndexedTokenTransfer,
  ProviderRunRecord,
  SkippedCounts,
} from '../providers/provider.types.js';

/** Tiga jenis transfer yang membentuk aliran dana. */
export type FlowTransferKind = 'native' | 'internal' | 'tokens';

export const FLOW_TRANSFER_KINDS: readonly FlowTransferKind[] = ['native', 'internal', 'tokens'];

/** Nama field yang hilang bila satu jenis transfer tidak bisa dipindai. */
export const MISSING_FIELD: Record<FlowTransferKind, string> = {
  native: 'native_transfers',
  internal: 'internal_transfers',
  tokens: 'token_transfers',
};

/** Hasil membaca satu jenis transfer, halaman demi halaman dari yang terbaru. */
export interface KindCoverage {
  /** `null` bila berhasil; alasan aman ditampilkan bila gagal. */
  failure: string | null;
  /** Riwayat habis dibaca (tidak ada halaman lagi). */
  exhausted: boolean;
  pages: number;
  /** Blok dan waktu item tertua yang terbaca; `null` bila tidak ada item. */
  oldest: { blockNumber: number; timestamp: Date } | null;
  skipped: SkippedCounts | null;
}

export interface ChainHead {
  blockNumber: number;
  timestamp: Date;
}

/** Cakupan pemindaian; bentuknya sama dengan baris `address_flow_scans`. */
export interface FlowScan {
  blockFrom: number;
  blockTo: number;
  windowFrom: Date;
  windowTo: Date;
  nativeScanned: boolean;
  tokensScanned: boolean;
  internalScanned: boolean;
  status: DataStatus;
  statusReason: string | null;
  missingFields: string[];
}

export interface AddressFlowCollection {
  chainId: string;
  /** Address seperti yang diminta (sudah di-trim). */
  address: string;
  fetchedAt: Date;
  /** Semua pengambilan provider, termasuk yang gagal. */
  runs: ProviderRunRecord[];
  head: ChainHead | null;
  nativeTransfers: IndexedNativeTransfer[];
  tokenTransfers: IndexedTokenTransfer[];
  coverage: Record<FlowTransferKind, KindCoverage>;
  /** `null` bila rentang blok sama sekali tidak diketahui (mis. tidak ada sumber data). */
  scan: FlowScan | null;
  /** Alasan tidak ada yang bisa dipindai; `null` bila setidaknya satu jenis terbaca. */
  failure: string | null;
  /**
   * Label eksternal pihak-pihak transfer dari indexer, per address, beserta
   * run provider yang membawanya.
   */
  partyLabels: Array<{ address: string; labels: ExternalLabel[]; runKey: string }>;
}
