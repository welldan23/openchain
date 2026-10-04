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

/**
 * Jenis informasi yang bisa ditandai badge: klasifikasi temuan, ditambah
 * `unavailable` untuk data yang gagal diambil atau belum dipindai. Data yang
 * tidak tersedia bukan temuan, jadi tidak dipakai di `FindingClassification`.
 */
export type InfoClassification = FindingClassification | "unavailable";

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

/** Jenis koordinasi yang dideteksi di antara wallet peta. */
export type CoordinationKind = "funding_burst" | "same_block_buy" | "similar_amount" | "coordinated_sell";

/**
 * Satu kejadian yang tampak terkoordinasi: beberapa wallet melakukan hal
 * serupa di waktu yang sangat berdekatan. Selalu heuristic.
 */
export interface CoordinationEvent {
  id: string;
  kind: CoordinationKind;
  /** Penjelasan singkat, mis. "5 wallet didanai dalam 9 menit". */
  detail: string;
  members: string[];
  confidence: ClusterConfidence;
  /** Waktu kejadian pertama. */
  timestamp: string;
  /** Rentang waktu kejadian dalam detik; 0 bila di blok yang sama. */
  windowSeconds: number;
  blockNumber?: number;
  /** Transaksi on-chain yang mendukung temuan ini. */
  transactions: CoordinationTx[];
}

/** Aksi dalam transaksi pendukung temuan koordinasi. */
export type CoordinationTxAction = "funding" | "buy" | "sell" | "add_liquidity" | "transfer";

/** Satu transaksi pendukung temuan koordinasi; selalu fakta on-chain. */
export interface CoordinationTx {
  txHash: string;
  timestamp: string;
  blockNumber: number;
  action: CoordinationTxAction;
  from: string;
  to: string;
  asset: FlowAsset;
  amount: number;
  amountUsd?: number;
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
  coordination: CoordinationEvent[];
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

/* -------------------------------------------------------------------------- */
/* Jelajah Multichain                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Status data satu chain: `ok` lengkap, `stale` tertinggal dari snapshot
 * chain lain, `unavailable` gagal dimuat sehingga aktivitasnya tidak diketahui.
 */
export type ChainDataStatus = "ok" | "stale" | "unavailable";

/** Aktivitas satu address di satu chain selama periode data. */
export interface ChainActivity {
  chain: ChainId;
  status: ChainDataStatus;
  /** Penjelasan untuk status selain `ok`, mis. "RPC tidak menjawab". */
  statusReason?: string;
  /** Waktu data chain ini diambil, bila berbeda dari snapshot utama. */
  fetchedAt?: string;
  txCount: number;
  inUsd: number;
  outUsd: number;
  counterpartyCount: number;
  /** Kosong bila belum pernah aktif di chain ini. */
  firstSeen?: string;
  lastSeen?: string;
  /** Saldo native coin dalam USD pada snapshot. */
  balanceUsd: number;
  /** Nomor blok snapshot chain ini. */
  snapshotBlock: number;
}

/** Status pencocokan kiriman bridge di chain asal dengan penerimaan di chain tujuan. */
export type BridgeMatchStatus = "matched" | "pending" | "unmatched";

/** Perpindahan dana antar chain lewat bridge. */
export interface BridgeMove {
  id: string;
  fromChain: ChainId;
  toChain: ChainId;
  bridge: EntityLabel;
  asset: FlowAsset;
  amountSent: number;
  /** Jumlah yang diterima di chain tujuan; kosong bila belum ditemukan. */
  amountReceived?: number;
  amountUsd?: number;
  sentTxHash: string;
  sentAt: string;
  receivedTxHash?: string;
  receivedAt?: string;
  status: BridgeMatchStatus;
}

/** Jenis aktivitas di linimasa lintas chain. */
export type CrossChainActivityKind = "in" | "out" | "bridge_out" | "bridge_in";

/** Satu transfer di salah satu chain, dilihat dari address yang dijelajahi. */
export interface CrossChainActivity {
  id: string;
  chain: ChainId;
  kind: CrossChainActivityKind;
  timestamp: string;
  counterparty: string;
  counterpartyLabel?: EntityLabel;
  asset: FlowAsset;
  amount: number;
  amountUsd?: number;
  txHash: string;
  /** Id perpindahan bridge bila aktivitas ini salah satu kakinya. */
  bridgeId?: string;
}

/**
 * Aktivitas satu address EVM di semua chain EVM yang didukung.
 * Asumsi kontrak API: `GET /multichain/:address` → `MultichainProfile`.
 */
export interface MultichainProfile {
  address: string;
  label?: EntityLabel;
  window: { from: string; to: string };
  /** Semua chain dengan format address yang sama, termasuk yang tidak aktif. */
  chains: ChainActivity[];
  bridges: BridgeMove[];
  /** Linimasa aktivitas di semua chain, untuk panel aktivitas lintas chain. */
  activities: CrossChainActivity[];
  fetchedAt: string;
  sources: string[];
}

/** Ringkasan profil untuk daftar/tautan. */
export interface MultichainProfileSummary {
  address: string;
  label?: EntityLabel;
  activeChains: ChainId[];
}

/* -------------------------------------------------------------------------- */
/* Pencarian & Riwayat                                                         */
/* -------------------------------------------------------------------------- */

/** Jenis isian pencarian, dikenali dari bentuknya. */
export type SearchQueryKind = "empty" | "evm_address" | "solana_address" | "evm_tx" | "solana_tx" | "text";

export type SearchResultKind = "token" | "address" | "transaction";

/** Satu hasil pencarian yang bisa dibuka. */
export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  /** Keterangan kecil, mis. simbol token atau address pendek. */
  subtitle: string;
  chain?: ChainId;
  label?: EntityLabel;
  href: string;
  /** Kenapa hasil ini cocok, mis. "Nama token" atau "Address persis". */
  matchedBy: string;
  /** Ringkasan entitas untuk daftar hasil; kosong bila belum dimuat. */
  meta?: SearchResultMeta;
}

/**
 * Ringkasan entitas di baris hasil pencarian. Field opsional yang kosong
 * berarti datanya belum ada, bukan bernilai nol.
 */
export type SearchResultMeta =
  | {
      kind: "token";
      riskLevel: RiskLevel;
      findingCount: number;
      verified: boolean;
      deployedAt: string;
      priceUsd?: number;
      liquidityUsd?: number;
      holderCount?: number;
    }
  | {
      kind: "address";
      /** Halaman tujuan: aliran dana satu chain atau jelajah multichain. */
      view: "flow" | "multichain";
      txCount: number;
      inUsd?: number;
      outUsd?: number;
      /** Chain tempat address ini aktif. */
      activeChains: ChainId[];
      lastSeen?: string;
    }
  | {
      kind: "transaction";
      /** Arah relatif terhadap address di halaman tujuan. */
      direction: FlowDirection;
      amount: number;
      assetSymbol: string;
      amountUsd?: number;
      timestamp: string;
      counterparty: string;
      counterpartyLabel?: EntityLabel;
    };

/** Jenis halaman investigasi yang tercatat di riwayat. */
export type InvestigationKind = "token" | "flow" | "trace" | "map" | "multichain";

/** Satu investigasi yang pernah dibuka. */
export interface InvestigationEntry {
  id: string;
  kind: InvestigationKind;
  title: string;
  chain?: ChainId;
  href: string;
  openedAt: string;
  /** Catatan singkat user, bila ada. */
  note?: string;
  /** Jumlah temuan yang tercatat saat terakhir dibuka. */
  findingCount?: number;
}

/* -------------------------------------------------------------------------- */
/* Kasus investigasi                                                           */
/* -------------------------------------------------------------------------- */

/** Tahap kasus: masih diselidiki, dipantau, atau sudah ditutup. */
export type CaseStatus = "open" | "monitoring" | "closed";

/** Kelengkapan data kasus saat snapshot diambil (sesuai PRD). */
export type CaseDataStatus = "complete" | "partial" | "unavailable" | "stale";

/** Entitas yang diselidiki dalam kasus. */
export interface CaseSubject {
  kind: "token" | "address";
  chain?: ChainId;
  address: string;
  title: string;
  label?: EntityLabel;
  href: string;
}

/** Temuan kasus; setiap temuan menunjuk ke hash transaksi buktinya. */
export interface CaseFinding {
  id: string;
  title: string;
  detail: string;
  classification: FindingClassification;
  evidenceTxHashes: string[];
}

export interface CaseNote {
  id: string;
  body: string;
  createdAt: string;
}

/**
 * Satu kasus investigasi yang disimpan: entitas yang diselidiki, temuan,
 * bukti transaksi, langkah investigasi, catatan pribadi, dan snapshot data
 * supaya hasilnya bisa direproduksi.
 * Asumsi kontrak API: `GET /cases/:id` → `InvestigationCase`.
 */
export interface InvestigationCase {
  id: string;
  title: string;
  summary: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  subjects: CaseSubject[];
  findings: CaseFinding[];
  evidence: TxEvidence[];
  /** Halaman investigasi yang dibuka untuk kasus ini, terbaru dulu. */
  steps: InvestigationEntry[];
  notes: CaseNote[];
  snapshot: {
    fetchedAt: string;
    blocks: Array<{ chain: ChainId; blockNumber: number }>;
    sources: string[];
    dataStatus: CaseDataStatus;
    /** Penjelasan untuk status selain `complete`. */
    statusReason?: string;
  };
}

/** Ringkasan kasus untuk daftar. Asumsi kontrak API: `GET /cases` → `CaseSummary[]`. */
export interface CaseSummary {
  id: string;
  title: string;
  summary: string;
  status: CaseStatus;
  updatedAt: string;
  tags: string[];
  chains: ChainId[];
  subjectCount: number;
  findingCount: number;
  evidenceCount: number;
  noteCount: number;
  dataStatus: CaseDataStatus;
}

/* -------------------------------------------------------------------------- */
/* Risiko & Label                                                              */
/* -------------------------------------------------------------------------- */

/** Objek yang dinilai risikonya. */
export type RiskObjectKind = "token" | "wallet" | "contract";

/** Satu alasan penilaian beserta sumbangannya ke skor. */
export interface RiskReason {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  classification: FindingClassification;
  /** Poin yang disumbangkan ke skor; `null` bila tidak ikut dihitung, mis. asumsi. */
  points: number | null;
  evidenceTxHashes: string[];
}

/** Ciri berbahaya yang dipantau, dikelompokkan per kategori di `DANGER_TRAIT_META`. */
export type DangerTrait =
  | "tax_change"
  | "mint_active"
  | "sell_blocked"
  | "blacklist"
  | "upgradeable"
  | "liquidity_unlocked"
  | "liquidity_pulled"
  | "holder_concentration"
  | "bundled_launch"
  | "fresh_wallet_funding"
  | "exchange_cashout"
  | "bridge_hop";

export type DangerCategory = "contract" | "liquidity" | "holders" | "flow";

/**
 * Hasil pemantauan satu ciri: `detected` terdeteksi, `clear` sudah dicek dan
 * tidak ditemukan, `unknown` belum bisa dicek (bukan berarti aman).
 */
export type DangerTraitStatus = "detected" | "clear" | "unknown";

export interface DangerTraitCheck {
  trait: DangerTrait;
  status: DangerTraitStatus;
  /** Keterangan singkat, wajib untuk `clear` dan `unknown`. */
  note?: string;
  /** Peringatan atau alasan penilaian yang memuat buktinya, untuk `detected`. */
  warningId?: string;
  reasonId?: string;
}

/** Peringatan dini: pola baru yang perlu dipantau sebelum jadi temuan. */
export interface RiskWarning {
  id: string;
  trait: DangerTrait;
  title: string;
  description: string;
  severity: RiskSeverity;
  classification: FindingClassification;
  detectedAt: string;
  evidenceTxHashes: string[];
}

/** Label entitas beserta asal dan dasar pemberiannya. */
export interface RiskLabel extends EntityLabel {
  /** Keyakinan 0–1; hanya untuk label heuristic. */
  confidence?: number;
  /** Kenapa label ini diberikan, dalam bahasa sederhana. */
  basis: string;
  addedAt: string;
  evidenceTxHashes: string[];
}

/** Halaman investigasi lain untuk objek yang sama. */
export interface RiskObjectLink {
  kind: "token" | "flow" | "map" | "multichain";
  title: string;
  href: string;
}

/**
 * Penilaian risiko satu objek (token, wallet, atau kontrak) pada satu
 * snapshot. Skor `null` berarti data belum cukup untuk dinilai, bukan aman.
 */
export interface ObjectRisk {
  kind: RiskObjectKind;
  chain: ChainId;
  address: string;
  title: string;
  /** Skor 0–100, makin tinggi makin berisiko. */
  score: number | null;
  level: RiskLevel;
  reasons: RiskReason[];
  warnings: RiskWarning[];
  /** Ciri berbahaya yang dipantau untuk objek ini beserta hasilnya. */
  traitChecks: DangerTraitCheck[];
  labels: RiskLabel[];
  /** Detail transaksi bukti yang tersedia; hash lain dibuka di explorer. */
  evidence: TxEvidence[];
  links: RiskObjectLink[];
  snapshot: DataSnapshot & { dataStatus: CaseDataStatus; statusReason?: string };
}

/** Ringkasan objek berisiko untuk daftar/tautan. */
export interface ObjectRiskSummary {
  kind: RiskObjectKind;
  chain: ChainId;
  address: string;
  title: string;
  score: number | null;
  level: RiskLevel;
  warningCount: number;
}

/* -------------------------------------------------------------------------- */
/* Laporan Bukti                                                               */
/* -------------------------------------------------------------------------- */

export type ReportStatus = "draft" | "review" | "final";

/**
 * Klaim di laporan. Sesuai PRD, setiap klaim penting wajib menyebut provider
 * dan waktu datanya, serta hash transaksi bila tersedia. Nilai kosong di sini
 * ditandai di panel kesiapan, tidak diisi tebakan.
 */
export interface ReportClaim {
  id: string;
  title: string;
  detail: string;
  classification: FindingClassification;
  provider: string | null;
  observedAt: string | null;
  evidenceTxHashes: string[];
}

export type ReportBlock =
  | { kind: "paragraph"; id: string; text: string }
  | { kind: "claim"; id: string; claim: ReportClaim }
  | { kind: "evidence"; id: string; chain: ChainId; txHash: string; caption: string }
  | { kind: "note"; id: string; body: string; createdAt: string };

export interface ReportSection {
  id: string;
  title: string;
  blocks: ReportBlock[];
}

/**
 * Laporan investigasi berbasis bukti, biasanya disusun dari satu kasus.
 * Asumsi kontrak API: `GET /reports/:id` → `InvestigationReport`.
 */
export interface InvestigationReport {
  id: string;
  title: string;
  summary: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  /** Kasus sumber laporan, bila ada. */
  source: { caseId: string; title: string; href: string } | null;
  sections: ReportSection[];
  /** Detail transaksi bukti yang tersimpan; hash lain dibuka di explorer. */
  evidence: TxEvidence[];
  snapshot: InvestigationCase["snapshot"];
}

/** Ringkasan laporan untuk daftar. Asumsi kontrak API: `GET /reports` → `ReportSummary[]`. */
export interface ReportSummary {
  id: string;
  title: string;
  summary: string;
  status: ReportStatus;
  updatedAt: string;
  sourceTitle: string | null;
  sectionCount: number;
  claimCount: number;
  evidenceCount: number;
  /** Masalah yang menghalangi laporan dianggap siap. */
  blockerCount: number;
}
