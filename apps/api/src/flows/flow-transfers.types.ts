/**
 * Kontrak respons `GET /api/flows/:chain/:address/transfers`: transfer satu
 * address dalam rentang yang dipilih, terbaru dulu, per halaman.
 */
import type { DataStatus } from '../database/schema/enums.js';
import type {
  FlowAsset,
  FlowChainInfo,
  FlowFailedAttempt,
  FlowLabelView,
  FlowScanInfo,
  FlowWindowView,
  MovementTypeView,
} from './flow-summary.types.js';

export interface FlowTransferView {
  /** Kunci stabil transfer, mis. `token:42`. */
  id: string;
  /** Relatif terhadap address; `self` = transfer ke diri sendiri. */
  direction: 'in' | 'out' | 'self';
  transferKind: 'native' | 'internal' | 'token';
  counterparty: { address: string; labels: FlowLabelView[] };
  asset: FlowAsset;
  amountRaw: string;
  amount: string | null;
  /** Nilai USD saat transaksi; `null` bila harganya tidak diketahui. */
  amountUsd: number | null;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  /** Perpindahannya sendiri adalah fakta on-chain. */
  classification: 'verified_fact';
  /** Jenis perpindahan dan dasarnya; `null` bila belum diklasifikasikan. */
  movement: MovementTypeView | null;
}

export interface FlowTransfersResponse {
  chain: FlowChainInfo;
  address: string;
  scan: FlowScanInfo | null;
  lastFailedAttempt: FlowFailedAttempt | null;
  window: FlowWindowView | null;
  direction: 'in' | 'out' | null;
  items: FlowTransferView[];
  /** Untuk `?cursor=` halaman berikutnya; `null` bila sudah habis. */
  nextCursor: string | null;
  dataStatus: DataStatus;
}
