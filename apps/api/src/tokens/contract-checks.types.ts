/**
 * Kontrak respons `GET /api/tokens/:chain/:address/contract-checks`.
 */
import type { DataStatus, InfoClassification } from '../database/schema/enums.js';
import type { EvidenceView } from './evidence.view.js';
import type { SnapshotHeader } from './token-summary.types.js';

export type CheckStatus = 'fail' | 'warn' | 'unknown' | 'pass';

export interface ContractCheckView {
  /** Kode stabil pemeriksaan, mis. `tax` atau `mint_authority`. */
  code: string;
  label: string;
  status: CheckStatus;
  value: string;
  description: string | null;
  /** Kosong bila pemeriksaan belum dijalankan (status `unknown`). */
  classification: InfoClassification | null;
  evidence: EvidenceView[];
}

export interface ContractChecksResponse {
  chain: { id: string; name: string; supportStatus: 'planned' | 'experimental' | 'validated' };
  token: {
    address: string;
    standard: 'erc20' | 'spl' | 'spl_token_2022';
    /** Nama standar yang mudah dibaca, mis. "ERC-20". */
    standardLabel: string;
  };
  snapshot: SnapshotHeader | null;
  dataStatus: DataStatus;
  /** Jumlah pemeriksaan per status, urut dari yang paling bermasalah. */
  summary: Array<{ status: CheckStatus; count: number }>;
  /** Urut: berisiko, perlu perhatian, belum dicek, lolos. */
  checks: ContractCheckView[];
}
