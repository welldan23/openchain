/**
 * Kontrak data halaman investigasi token.
 *
 * Bentuk data ini adalah asumsi kontrak API yang nanti diimplementasikan
 * backend (NestJS). Selama fase frontend, data diisi dari mock di
 * `src/lib/mock` lewat `src/lib/api/tokens.ts`.
 */

export type ChainId = "ethereum" | "bsc" | "solana" | "base" | "arbitrum";

/**
 * Klasifikasi transparansi untuk setiap temuan:
 * - fact: fakta on-chain yang bisa diverifikasi langsung
 * - calculation: hasil hitungan dari data on-chain
 * - heuristic: dugaan berbasis pola (selalu estimasi)
 * - external_label: label dari sumber pihak ketiga
 * - assumption: asumsi yang belum terverifikasi
 */
export type FindingClassification =
  | "fact"
  | "calculation"
  | "heuristic"
  | "external_label"
  | "assumption";

export type RiskSeverity = "critical" | "high" | "medium" | "low" | "info";

/** `unknown`: data belum cukup untuk menilai risiko. */
export type RiskLevel = "unknown" | "low" | "medium" | "high" | "critical";

export type EntityLabelType =
  | "exchange"
  | "router"
  | "bridge"
  | "market_maker"
  | "treasury"
  | "bot"
  | "whale"
  | "deployer"
  | "liquidity_pool"
  | "burn"
  | "unknown";

export interface EntityLabel {
  type: EntityLabelType;
  /** Nama entitas bila diketahui, mis. "Uniswap V2: NBLA/WETH". */
  name?: string;
  /** Asal label: sumber eksternal atau heuristic internal. */
  source: "external" | "heuristic";
  /** Nama sumber label, mis. "Etherscan" atau "OpenChain heuristic". */
  sourceName: string;
}

export interface TokenProfile {
  chain: ChainId;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  deployer: string;
  deployedAt: string;
  deployTxHash: string;
  /** Source code kontrak terverifikasi di explorer. */
  verified: boolean;
}

export interface TokenMarket {
  priceUsd: number;
  priceChange24hPct: number;
  marketCapUsd: number;
  fdvUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  holderCount: number;
  txCount24h: number;
}

export interface RiskFinding {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  classification: FindingClassification;
  /** Hash transaksi yang menjadi bukti temuan ini. */
  evidenceTxHashes: string[];
}

export interface RiskSummary {
  /** Skor 0–100, makin tinggi makin berisiko. */
  score: number;
  level: RiskLevel;
  findings: RiskFinding[];
}

/** Hasil satu pemeriksaan kontrak. */
export type ContractCheckStatus = "fail" | "warn" | "unknown" | "pass";

export interface ContractCheckItem {
  id: string;
  /** Nama pemeriksaan, mis. "Mint authority". */
  label: string;
  status: ContractCheckStatus;
  /** Hasil singkat, mis. "Aktif, pembuat bisa mencetak supply baru". */
  value: string;
  /** Kenapa pemeriksaan ini penting. */
  description?: string;
  /** Kosong bila pemeriksaan belum dijalankan (status `unknown`). */
  classification?: FindingClassification;
  evidenceTxHashes: string[];
}

export interface ContractCheck {
  /** Standar token, mis. "ERC-20" atau "SPL Token". */
  standard: string;
  items: ContractCheckItem[];
}

export interface TokenHolder {
  rank: number;
  address: string;
  label?: EntityLabel;
  balance: number;
  /** Persentase dari total supply. */
  sharePct: number;
}

export interface HolderConcentration {
  top10Pct: number;
  top50Pct: number;
  classification: FindingClassification;
}

export type ActivityType =
  | "deploy"
  | "mint"
  | "add_liquidity"
  | "remove_liquidity"
  | "buy"
  | "sell"
  | "transfer"
  | "burn";

export interface TokenActivity {
  id: string;
  type: ActivityType;
  txHash: string;
  timestamp: string;
  from: string;
  to: string;
  amount: number;
  amountUsd?: number;
}

export interface EvidenceItem {
  txHash: string;
  timestamp: string;
  summary: string;
  classification: FindingClassification;
  /** Id temuan risiko yang didukung transaksi ini. */
  relatedFindingIds: string[];
}

export interface DataSnapshot {
  /** Waktu data diambil, untuk reproducibility investigasi. */
  fetchedAt: string;
  blockNumber: number;
  sources: string[];
}

export interface TokenInvestigation {
  token: TokenProfile;
  market: TokenMarket;
  risk: RiskSummary;
  contract: ContractCheck;
  holders: {
    concentration: HolderConcentration;
    top: TokenHolder[];
  };
  activity: TokenActivity[];
  evidence: EvidenceItem[];
  snapshot: DataSnapshot;
}

/** Ringkasan token untuk daftar/tautan, mis. di beranda. */
export interface TokenSummary {
  chain: ChainId;
  address: string;
  name: string;
  symbol: string;
  riskLevel: RiskLevel;
}
