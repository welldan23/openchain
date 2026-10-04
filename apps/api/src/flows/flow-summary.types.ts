/**
 * Kontrak respons `GET /api/flows/:chain/:address/summary`.
 *
 * Jumlah mentah dikirim sebagai string (presisi uint256). Total yang belum
 * diketahui bernilai `null`, bukan nol: address yang belum pernah dipindai
 * tidak sama dengan address tanpa transfer.
 */
import type { DataStatus, InfoClassification } from '../database/schema/enums.js';
import type { HolderLabelView } from '../tokens/holders.types.js';

export interface FlowChainInfo {
  id: string;
  name: string;
  nativeSymbol: string;
  explorerUrl: string | null;
  supportStatus: 'planned' | 'experimental' | 'validated';
}

/** Label entitas beserta sumbernya; bentuknya sama dengan label holder. */
export type FlowLabelView = HolderLabelView;

/** Cakupan pemindaian yang dipakai ringkasan. */
export interface FlowScanInfo {
  id: number;
  scannedAt: string;
  blockFrom: number;
  blockTo: number;
  windowFrom: string;
  windowTo: string;
  coverage: { native: boolean; internal: boolean; tokens: boolean };
  /** Status saat dipindai. */
  collectedStatus: DataStatus;
  /** Status sekarang; `stale` bila pemindaian sudah terlalu lama. */
  dataStatus: DataStatus;
  statusReason: string | null;
  missingFields: string[];
}

/** Percobaan pemindaian terbaru yang gagal setelah pemindaian yang dipakai. */
export interface FlowFailedAttempt {
  scannedAt: string;
  status: DataStatus;
  statusReason: string | null;
}

/** Rentang waktu yang benar-benar dipakai; `preset` kosong untuk rentang sendiri. */
export interface FlowWindowView {
  from: string;
  to: string;
  clipped: boolean;
  preset: '24h' | '7d' | '30d' | 'all' | null;
}

export type FlowAsset =
  | { type: 'native'; symbol: string; decimals: number | null }
  | { type: 'token'; address: string; symbol: string | null; name: string | null; decimals: number | null };

export interface FlowSide {
  transferCount: number;
  amountRaw: string;
  /** Dalam satuan aset; `null` bila desimal tidak diketahui. */
  amount: string | null;
  /** Jumlah USD dari transfer yang punya harga saat transaksi. */
  amountUsd: number | null;
  /** Transfer tanpa harga saat transaksi; tidak ikut `amountUsd`. */
  unpricedCount: number;
}

export interface FlowAssetSummary {
  asset: FlowAsset;
  in: FlowSide;
  out: FlowSide;
  /** Masuk dikurangi keluar, bisa negatif. */
  netRaw: string;
  net: string | null;
}

export interface FlowTotals {
  in: { transferCount: number; counterpartyCount: number };
  out: { transferCount: number; counterpartyCount: number };
  /** Lawan transaksi unik di kedua arah. */
  counterpartyCount: number;
  /** Transfer ke diri sendiri; tidak dihitung masuk maupun keluar. */
  selfTransferCount: number;
  usd: {
    inUsd: number | null;
    outUsd: number | null;
    netUsd: number | null;
    pricedCount: number;
    unpricedCount: number;
    classification: InfoClassification;
  };
}

export interface FlowSummaryResponse {
  chain: FlowChainInfo;
  /** Identifier asli address. */
  address: string;
  labels: FlowLabelView[];
  scan: FlowScanInfo | null;
  lastFailedAttempt: FlowFailedAttempt | null;
  /** Rentang waktu yang benar-benar diringkas: irisan permintaan dan cakupan. */
  window: FlowWindowView | null;
  totals: FlowTotals | null;
  assets: FlowAssetSummary[];
  dataStatus: DataStatus;
}
