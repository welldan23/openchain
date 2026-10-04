/**
 * Kontrak respons `GET /api/flows/:address/chains`: di chain mana saja address
 * ini sudah dipindai, untuk memilih chain di halaman aliran dana.
 */
import type { DataStatus } from '../database/schema/enums.js';
import type { FlowChainInfo, FlowFailedAttempt, FlowScanInfo } from './flow-summary.types.js';

export interface FlowChainEntry {
  chain: FlowChainInfo;
  /** Address ini pernah dicatat di chain ini (sebagai subjek atau lawan transaksi). */
  known: boolean;
  /** Pemindaian terbaru yang berhasil; `null` bila belum pernah. */
  scan: FlowScanInfo | null;
  lastFailedAttempt: FlowFailedAttempt | null;
  /** Transfer dalam cakupan pemindaian; `null` bila belum dipindai (belum diketahui, bukan nol). */
  transferCount: number | null;
  dataStatus: DataStatus;
}

export interface FlowChainsResponse {
  /** Address seperti yang diminta. */
  address: string;
  chains: FlowChainEntry[];
}
