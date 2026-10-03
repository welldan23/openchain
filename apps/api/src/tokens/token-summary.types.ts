/**
 * Kontrak respons `GET /api/tokens/:chain/:address/summary`.
 *
 * Angka besar (supply mentah) dikirim sebagai string agar tidak kehilangan
 * presisi. Field yang datanya belum tersedia bernilai `null`, tidak ditebak.
 */
import type { DataStatus } from '../database/schema/enums.js';

export interface ChainInfo {
  id: string;
  name: string;
  family: 'evm' | 'solana' | 'bitcoin' | 'tron' | 'ton';
  nativeSymbol: string;
  explorerUrl: string | null;
  /** `planned` / `experimental`: chain belum tervalidasi lewat smoke test. */
  supportStatus: 'planned' | 'experimental' | 'validated';
}

export interface TokenProfile {
  /** Address seperti yang pertama kali dicatat (identifier asli). */
  address: string;
  standard: 'erc20' | 'spl' | 'spl_token_2022';
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  /** Total supply mentah (satuan terkecil). */
  totalSupplyRaw: string | null;
  /** Total supply dalam satuan token, mis. "1000000000". */
  totalSupply: string | null;
  deployer: string | null;
  deployedAt: string | null;
  deployTxHash: string | null;
  sourceVerified: boolean | null;
}

export interface ProviderSource {
  provider: string;
  kind: string;
  operation: string;
  status: DataStatus;
  fetchedAt: string | null;
  errorReason: string | null;
  missingFields: string[];
}

export interface SnapshotInfo {
  blockNumber: number;
  fetchedAt: string;
  /** Status saat data diambil. */
  collectedStatus: DataStatus;
  /** Status sekarang; `stale` bila snapshot sudah terlalu lama. */
  dataStatus: DataStatus;
  sources: ProviderSource[];
}

export interface MarketInfo {
  priceUsd: number | null;
  priceChange24hPct: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  holderCount: number | null;
  txCount24h: number | null;
}

export interface TokenSummaryResponse {
  chain: ChainInfo;
  token: TokenProfile;
  /** Kosong bila token sudah terdaftar tapi belum pernah diambil datanya. */
  snapshot: SnapshotInfo | null;
  /** Status data keseluruhan; `unavailable` bila belum ada snapshot. */
  dataStatus: DataStatus;
  market: MarketInfo | null;
  concentration: { top10Pct: number | null; top50Pct: number | null } | null;
  risk: {
    score: number | null;
    level: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
  };
}
