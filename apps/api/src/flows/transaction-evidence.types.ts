/**
 * Kontrak respons `GET /api/transactions/:chain/:hash`: bukti satu transaksi
 * untuk modal bukti di frontend. Perpindahan dana adalah fakta on-chain yang
 * tersimpan; klaim analisis yang memakai transaksi ini ditampilkan terpisah
 * beserta klasifikasinya.
 */
import type { DataStatus } from '../database/schema/enums.js';
import type { EvidenceView } from '../tokens/evidence.view.js';
import type { FlowAsset, FlowChainInfo, FlowLabelView, MovementTypeView } from './flow-summary.types.js';

export interface TxParty {
  address: string;
  labels: FlowLabelView[];
}

export interface TxMovementView {
  index: number;
  transferKind: 'native' | 'internal' | 'token';
  /** Posisi di transaksi: kosong untuk nilai transaksi, trace path, atau log index. */
  position: string;
  from: TxParty;
  to: TxParty;
  asset: FlowAsset;
  amountRaw: string;
  amount: string | null;
  amountUsd: number | null;
  classification: 'verified_fact';
  /** Jenis perpindahan dan dasarnya; `null` bila belum diklasifikasikan. */
  movement: MovementTypeView | null;
}

export interface TransactionEvidenceResponse {
  chain: FlowChainInfo;
  txHash: string;
  explorerUrl: string | null;
  blockNumber: number;
  timestamp: string;
  /** Detail transaksi bila sudah diambil; `null` bila hanya transfernya yang tercatat. */
  transaction: {
    from: string | null;
    to: string | null;
    method: string | null;
    success: boolean | null;
    valueRaw: string | null;
  } | null;
  movements: TxMovementView[];
  /** Klaim analisis (temuan, cek kontrak) yang memakai transaksi ini sebagai bukti. */
  claims: EvidenceView[];
  /** Pengambilan provider yang mencatat perpindahan ini. */
  sources: Array<{ provider: string; operation: string; status: DataStatus; fetchedAt: string | null }>;
}
