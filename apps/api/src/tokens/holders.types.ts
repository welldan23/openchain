/**
 * Kontrak respons `GET /api/tokens/:chain/:address/holders`.
 */
import type { DataStatus, InfoClassification } from '../database/schema/enums.js';
import type { SnapshotHeader } from './token-summary.types.js';

export interface HolderLabelView {
  type: string;
  /** Nama entitas bila ada, mis. "Uniswap V2: NBLA/WETH". */
  name: string | null;
  source: 'external' | 'heuristic' | 'user';
  sourceName: string;
  classification: InfoClassification;
  confidence: number | null;
}

export interface HolderView {
  rank: number;
  /** Identifier asli address holder. */
  address: string;
  /** Saldo mentah (satuan terkecil). */
  balanceRaw: string;
  /** Saldo dalam satuan token; kosong bila decimals token belum diketahui. */
  balance: string | null;
  /** Persen dari total supply. */
  sharePct: number;
  /** Label entitas: sumber eksternal dulu, lalu heuristic, lalu catatan user. */
  labels: HolderLabelView[];
}

export interface HoldersResponse {
  chain: { id: string; name: string; supportStatus: 'planned' | 'experimental' | 'validated' };
  token: { address: string; symbol: string | null; decimals: number | null };
  snapshot: SnapshotHeader | null;
  dataStatus: DataStatus;
  /** Jumlah seluruh holder pada snapshot, bila diketahui. */
  holderCount: number | null;
  /** Konsentrasi supply, dihitung dari saldo pada snapshot. */
  concentration: {
    top10Pct: number | null;
    top50Pct: number | null;
    classification: InfoClassification;
  } | null;
  /** Holder teratas urut peringkat, sebanyak `limit`. */
  holders: HolderView[];
}
