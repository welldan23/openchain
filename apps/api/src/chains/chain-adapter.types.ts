/**
 * Kontrak antara adapter chain dan proses ingest. Adapter mengumpulkan data
 * dari provider tanpa menulis ke database; `TokenIngestionService` yang
 * menyimpannya. Dengan begitu logika satu chain tidak bocor ke bagian lain.
 */
import type { ChainSupportStatus, CheckStatus, InfoClassification } from '../database/schema/enums.js';
import type { ExternalLabel, ProviderRunRecord } from '../providers/provider.types.js';

/** Bukti yang dikumpulkan adapter, sebelum disimpan ke tabel `evidence`. */
export interface CollectedEvidence {
  classification: InfoClassification;
  explanation: string;
  /** Hal yang dibuktikan; bagian dari `evidence_key` supaya penyimpanan idempotent. */
  subject: string;
  /** Kunci run provider yang menghasilkan bukti ini. */
  runKey: string;
  txHash?: string | null;
  blockNumber?: number | null;
  blockTimestamp?: Date | null;
  method?: string | null;
  /** Address kontrak yang dibaca. */
  contractAddress?: string | null;
}

export interface CollectedCheck {
  code: string;
  label: string;
  status: CheckStatus;
  value: string;
  description: string | null;
  /** Wajib kosong untuk status `unknown`. */
  classification: InfoClassification | null;
  evidence: CollectedEvidence[];
}

export interface CollectedHolder {
  address: string;
  isContract: boolean | null;
  rank: number;
  /** Saldo pada blok snapshot, dibaca lewat RPC. */
  balanceRaw: string;
  /** Persen dari total supply, 6 angka di belakang koma. */
  sharePct: string;
  labels: ExternalLabel[];
}

export interface CollectedToken {
  standard: 'erc20';
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  /** Total supply pada blok snapshot. */
  totalSupplyRaw: string | null;
  sourceVerified: boolean | null;
  deployer: string | null;
  deployTxHash: string | null;
  deployedAt: Date | null;
}

export interface CollectedMarket {
  priceUsd: string | null;
  priceChange24hPct: string | null;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  txCount24h: number | null;
}

/** Hasil pengumpulan data satu token di satu chain. */
export interface TokenCollection {
  chainId: string;
  /** Address seperti yang diminta (sudah di-trim). */
  address: string;
  /** Semua pengambilan provider, termasuk yang gagal. */
  runs: ProviderRunRecord[];
  /** Alasan snapshot tidak bisa dibuat; `null` bila snapshot bisa dibuat. */
  failure: string | null;
  /** Blok tempat state on-chain dibaca; `null` bila RPC gagal. */
  blockNumber: number | null;
  blockTimestamp: Date | null;
  fetchedAt: Date;
  token: CollectedToken | null;
  market: CollectedMarket | null;
  holderCount: number | null;
  /** `null` bila holder tidak bisa diverifikasi pada blok snapshot. */
  holders: CollectedHolder[] | null;
  concentration: { top10Pct: string; top50Pct: string } | null;
  checks: CollectedCheck[];
}

export interface SmokeCheck {
  /** Kode pemeriksaan, mis. `rpc.chain_id`. */
  code: string;
  provider: string;
  ok: boolean;
  /** Pemeriksaan wajib menentukan status dukungan; yang opsional hanya informasi. */
  level: 'rpc' | 'data' | 'optional';
  detail: string;
}

export interface SmokeTestReport {
  chainId: string;
  /** Status dukungan yang pantas menurut hasil smoke test. */
  status: ChainSupportStatus;
  checks: SmokeCheck[];
  testedAt: Date;
}

export interface ChainAdapter {
  readonly chainId: string;
  /** Kumpulkan data token dari semua provider chain ini. Tidak menulis ke database. */
  collectToken(address: string): Promise<TokenCollection>;
  /** Cek apakah semua provider chain ini benar-benar bisa dipakai. */
  smokeTest(): Promise<SmokeTestReport>;
}
