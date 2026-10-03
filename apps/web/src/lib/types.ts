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

/* -------------------------------------------------------------------------- */
/* Lacak Aliran Dana                                                           */
/* -------------------------------------------------------------------------- */

/** Arah transfer relatif terhadap address yang dilacak. */
export type FlowDirection = "in" | "out";

export interface FlowAsset {
  symbol: string;
  /** Address kontrak token; `null` untuk native coin, mis. ETH. */
  address: string | null;
}

/**
 * Satu transfer masuk atau keluar dari address yang dilacak. Transfer adalah
 * fakta on-chain; label lawan transaksi tetap mengikuti sumber labelnya.
 */
export interface FlowTransfer {
  id: string;
  direction: FlowDirection;
  /** Address di sisi lain transfer: pengirim untuk `in`, penerima untuk `out`. */
  counterparty: string;
  counterpartyLabel?: EntityLabel;
  asset: FlowAsset;
  amount: number;
  /** Nilai USD saat transaksi; kosong bila harga aset tidak diketahui. */
  amountUsd?: number;
  txHash: string;
  timestamp: string;
}

/**
 * Aliran dana satu address dalam rentang waktu tertentu.
 * Asumsi kontrak API: `GET /flows/:chain/:address` → `AddressFlow`.
 */
export interface AddressFlow {
  chain: ChainId;
  address: string;
  label?: EntityLabel;
  /** Rentang waktu transfer yang dianalisis. */
  window: { from: string; to: string };
  transfers: FlowTransfer[];
  snapshot: DataSnapshot;
}

/** Ringkasan address untuk daftar/tautan, mis. di beranda. */
export interface AddressFlowSummary {
  chain: ChainId;
  address: string;
  label?: EntityLabel;
  transferCount: number;
}

/** Satu langkah perpindahan dana di jalur antar wallet. */
export interface TraceHop {
  from: string;
  fromLabel?: EntityLabel;
  to: string;
  toLabel?: EntityLabel;
  asset: FlowAsset;
  amount: number;
  amountUsd?: number;
  txHash: string;
  timestamp: string;
}

/**
 * Jalur dana dari satu wallet ke wallet lain, langkah demi langkah.
 * Tiap langkah adalah transfer on-chain; anggapan bahwa dananya "sama"
 * dari langkah ke langkah adalah heuristic.
 * Asumsi kontrak API: `GET /traces/:chain/:from/:to` → `WalletTrace`.
 */
export interface WalletTrace {
  chain: ChainId;
  from: string;
  fromLabel?: EntityLabel;
  to: string;
  toLabel?: EntityLabel;
  /** Batas langkah yang dicari; jalur lebih panjang tidak ditampilkan. */
  maxHops: number;
  /** Kosong bila tidak ada jalur dalam batas langkah. */
  hops: TraceHop[];
  snapshot: DataSnapshot;
}

/** Ringkasan jalur untuk daftar/tautan. */
export interface WalletTraceSummary {
  chain: ChainId;
  from: string;
  fromLabel?: EntityLabel;
  to: string;
  toLabel?: EntityLabel;
  hopCount: number;
}

/** Satu perpindahan aset di dalam sebuah transaksi. */
export interface TxMovement {
  from: string;
  fromLabel?: EntityLabel;
  to: string;
  toLabel?: EntityLabel;
  asset: FlowAsset;
  amount: number;
  amountUsd?: number;
}

/** Bukti satu transaksi: hash, waktu, dan perpindahan aset di dalamnya. */
export interface TxEvidence {
  chain: ChainId;
  txHash: string;
  timestamp: string;
  movements: TxMovement[];
}

/* -------------------------------------------------------------------------- */
/* Peta Hubungan Wallet                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Jenis garis di peta: `funding` = kiriman native coin (modal awal/gas),
 * `token_transfer` = kiriman token yang dipetakan.
 */
export type MapEdgeKind = "funding" | "token_transfer";

/** Wallet di peta; gelembungnya sebanding dengan porsi supply. */
export interface MapNode {
  address: string;
  label?: EntityLabel;
  /** Persen supply token; 0 untuk wallet penghubung yang bukan holder. */
  sharePct: number;
  isContract: boolean;
  /** Id klaster bila wallet ini masuk kelompok hasil heuristic. */
  clusterId?: string;
}

/** Hubungan dua wallet lewat satu transfer on-chain. */
export interface MapEdge {
  id: string;
  from: string;
  to: string;
  kind: MapEdgeKind;
  asset: FlowAsset;
  amount: number;
  amountUsd?: number;
  txHash: string;
  timestamp: string;
}

/**
 * Label klaster sesuai PRD. Semuanya hasil heuristic; insider/team hanya
 * dipakai bila ada bukti transaksi langsung.
 */
export type ClusterLabel =
  | "visual_cluster"
  | "common_funding"
  | "coordinated_execution"
  | "bundled_or_sniper_activity"
  | "market_maker_possible"
  | "likely_linked"
  | "insider_or_team"
  | "false_positive_possible"
  | "inconclusive";

export type ClusterConfidence = "low" | "medium" | "high";

/** Satu pola yang dicek untuk sebuah klaster, terpenuhi atau tidak. */
export interface ClusterSignal {
  id: string;
  /** Nama pola, mis. "Pendana langsung yang sama". */
  label: string;
  /** Penjelasan singkat hasil pengecekan. */
  detail: string;
  matched: boolean;
  evidenceTxHashes: string[];
}

/** Kelompok wallet yang diduga terkait; selalu heuristic. */
export interface MapCluster {
  id: string;
  name: string;
  /** Alasan pengelompokan dalam bahasa sederhana. */
  reason: string;
  labels: ClusterLabel[];
  confidence: ClusterConfidence;
  signals: ClusterSignal[];
  /** Hal yang bisa membuat dugaan ini keliru. */
  caveats: string[];
}

/**
 * Peta hubungan holder satu token.
 * Asumsi kontrak API: `GET /maps/:chain/:token` → `WalletMap`.
 */
export interface WalletMap {
  chain: ChainId;
  token: { address: string; name: string; symbol: string };
  nodes: MapNode[];
  edges: MapEdge[];
  clusters: MapCluster[];
  snapshot: DataSnapshot;
}

/** Ringkasan peta untuk daftar/tautan, mis. di beranda. */
export interface WalletMapSummary {
  chain: ChainId;
  tokenAddress: string;
  name: string;
  symbol: string;
  walletCount: number;
  clusterCount: number;
}
