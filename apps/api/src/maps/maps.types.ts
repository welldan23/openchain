/**
 * Kontrak respons `GET /api/maps/:chain/:token`,
 * `GET /api/maps/:chain/:token/clusters`,
 * `GET /api/maps/:chain/:token/coordination(/:findingId)`, dan
 * `GET /api/maps/:chain/:token/edges/:edgeId`.
 *
 * Wallet dan garis adalah fakta: holder dari snapshot, garis dari transfer
 * on-chain tersimpan (`verified_fact`). Kedekatan di peta bukan bukti bahwa
 * wallet dimiliki orang yang sama; pengelompokan wallet adalah dugaan dan
 * disajikan terpisah.
 */
import type {
  ClusterLabel,
  ConfidenceLevel,
  CoordinationAction,
  CoordinationKind,
  DataStatus,
  MapEdgeKind,
  MapNodeRole,
} from '../database/schema/enums.js';
import type { FlowAsset, FlowChainInfo, FlowLabelView, MovementTypeView } from '../flows/flow-summary.types.js';
import type { TransactionEvidenceResponse } from '../flows/transaction-evidence.types.js';

/** Wallet di peta. */
export interface WalletMapPartyView {
  /** Identifier asli address. */
  address: string;
  role: MapNodeRole;
  /** Persen supply pada snapshot dasar; 0 untuk pendana dan penghubung. */
  sharePct: number;
  /** `null` bila belum diketahui. */
  isContract: boolean | null;
  labels: FlowLabelView[];
}

export interface WalletMapNodeView extends WalletMapPartyView {
  /** Langkah dari holder terdekat; holder 0. */
  distance: number;
  /** Id kelompok bila wallet ini masuk kelompok hasil heuristic. */
  clusterId: string | null;
}

/** Transfer yang menjadi bukti sebuah sinyal kelompok. */
export interface ClusterEvidenceView {
  /** Kunci transfer, sama dengan id garis peta bila transfer itu juga garis. */
  id: string;
  transferKind: 'native' | 'internal' | 'token';
  txHash: string;
  blockNumber: number;
}

export interface ClusterSignalView {
  id: string;
  label: string;
  detail: string;
  matched: boolean;
  evidence: ClusterEvidenceView[];
}

/** Kelompok wallet yang diduga terkait; selalu dugaan, bukan bukti kepemilikan. */
export interface WalletClusterView {
  id: string;
  name: string;
  /** Alasan pengelompokan dalam bahasa sederhana. */
  reason: string;
  labels: ClusterLabel[];
  confidence: ConfidenceLevel;
  classification: 'heuristic';
  heuristic: string;
  /** Ada transfer langsung dari deployer ke anggota; syarat label `insider_or_team`. */
  hasDirectEvidence: boolean;
  /** Address anggota, termasuk pendana dan penghubung. */
  members: string[];
  holderCount: number;
  /** Total porsi supply holder anggota pada snapshot dasar. */
  sharePct: number;
  signals: ClusterSignalView[];
  /** Hal yang bisa membuat dugaan ini keliru. */
  caveats: string[];
}

/** Kapan dan dengan heuristic apa analisis peta (kelompok atau koordinasi) dihitung. */
export interface ClusteringInfo {
  heuristic: string;
  computedAt: string;
}

export interface WalletMapClustersResponse {
  chain: FlowChainInfo;
  token: { address: string; symbol: string | null };
  map: { id: number; builtAt: string; status: DataStatus };
  clustering: ClusteringInfo;
  clusters: WalletClusterView[];
  /** Holder peta yang tidak masuk kelompok mana pun. */
  unclusteredHolders: number;
  caveats: string[];
}

/** Transaksi pendukung kejadian koordinasi; transfernya fakta on-chain. */
export interface CoordinationTxView {
  /** Kunci transfer, mis. `native:12` atau `token:5`. */
  id: string;
  action: CoordinationAction;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  from: string;
  to: string;
  transferKind: 'native' | 'internal' | 'token';
  asset: FlowAsset;
  amountRaw: string;
  amount: string | null;
  amountUsd: number | null;
  classification: 'verified_fact';
}

/** Beberapa wallet melakukan hal serupa di waktu yang sangat berdekatan; selalu dugaan. */
export interface CoordinationEventView {
  id: string;
  kind: CoordinationKind;
  /** Penjelasan singkat, mis. "5 wallet didanai 0xabc…1234 dalam 9 menit". */
  detail: string;
  /** Address holder yang terlibat. */
  members: string[];
  confidence: ConfidenceLevel;
  classification: 'heuristic';
  heuristic: string;
  /** Waktu transaksi pertama. */
  timestamp: string;
  /** Rentang waktu kejadian dalam detik; 0 bila di blok yang sama. */
  windowSeconds: number;
  blockNumber: number | null;
  transactions: CoordinationTxView[];
}

export interface WalletMapCoordinationResponse {
  chain: FlowChainInfo;
  token: { address: string; symbol: string | null };
  map: { id: number; builtAt: string; status: DataStatus };
  analysis: ClusteringInfo;
  coordination: CoordinationEventView[];
  caveats: string[];
}

/** Pihak di sebuah temuan koordinasi: anggota, pendana, atau lawan transaksi. */
export interface CoordinationPartyView {
  address: string;
  /** Peran di peta; `null` bila address ini tidak ada di peta (mis. pool di luar holder teratas). */
  role: MapNodeRole | null;
  sharePct: number | null;
  isContract: boolean | null;
  labels: FlowLabelView[];
  /** Termasuk wallet yang bergerak serempak. */
  member: boolean;
  clusterId: string | null;
}

/** `GET /api/maps/:chain/:token/coordination/:findingId`. */
export interface CoordinationFindingResponse {
  chain: FlowChainInfo;
  token: { address: string; symbol: string | null };
  map: { id: number; builtAt: string; status: DataStatus };
  analysis: ClusteringInfo;
  finding: Omit<CoordinationEventView, 'transactions'> & {
    transactions: Array<CoordinationTxView & { movement: MovementTypeView | null }>;
  };
  parties: CoordinationPartyView[];
  /** Blok yang dipakai transaksi pendukung, urut naik. */
  blocks: Array<{ blockNumber: number; transactionCount: number }>;
  /** Transaksi yang berbagi blok dengan transaksi pendukung lain. */
  sameBlockTransactions: number;
  /** Kelompok wallet yang memuat anggota temuan ini. */
  relatedClusters: Array<{ id: string; name: string; labels: ClusterLabel[]; confidence: ConfidenceLevel; membersInFinding: number }>;
  caveats: string[];
}

export interface WalletMapEdgeView {
  /** Kunci transfer, mis. `native:12` atau `token:5`. */
  id: string;
  kind: MapEdgeKind;
  from: string;
  to: string;
  transferKind: 'native' | 'internal' | 'token';
  asset: FlowAsset;
  amountRaw: string;
  /** Dalam satuan aset; `null` bila desimal tidak diketahui. */
  amount: string | null;
  /** Nilai USD saat transaksi; `null` bila harga saat itu tidak diketahui. */
  amountUsd: number | null;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  classification: 'verified_fact';
}

export interface WalletMapInfo {
  /** Id peta tersimpan; buka lagi lewat `?map=` untuk hasil yang sama. */
  id: number;
  builtAt: string;
  /** Peta tersimpan dipakai ulang (`true`) atau baru dibentuk untuk permintaan ini. */
  reused: boolean;
  holderLimit: number;
  /** Lapis pendana yang ditelusuri saat peta dibentuk. */
  fundingDepth: number;
  /** Radius yang ditampilkan di respons ini, ≤ `fundingDepth`. */
  radius: number;
  /** Status saat peta dibentuk. */
  status: DataStatus;
  statusReason: string | null;
  missingFields: string[];
}

export interface WalletMapResponse {
  chain: FlowChainInfo;
  token: { address: string; name: string | null; symbol: string | null; decimals: number | null };
  map: WalletMapInfo;
  nodes: WalletMapNodeView[];
  edges: WalletMapEdgeView[];
  /** Kelompok wallet di seluruh peta (tidak dipotong radius). */
  clusters: WalletClusterView[];
  clustering: ClusteringInfo;
  /** Kejadian gerak serempak di seluruh peta (tidak dipotong radius atau filter). */
  coordination: CoordinationEventView[];
  coordinationAnalysis: ClusteringInfo;
  /**
   * Jumlah wallet per jenis label utama di dalam radius, sebelum filter label;
   * `none` = tanpa label. Dipakai untuk pilihan filter.
   */
  labelCounts: Array<{ type: string; count: number }>;
  /** Filter yang dipakai respons ini dan apa yang disembunyikannya. */
  filter: {
    hide: string[];
    labelSource: 'all' | 'external' | 'heuristic';
    from: string | null;
    to: string | null;
    /** `null` = semua jenis garis. */
    kinds: MapEdgeKind[] | null;
    hiddenNodes: number;
    hiddenEdges: number;
  };
  /** Hal yang bisa membuat peta keliru atau tidak lengkap, dalam bahasa sederhana. */
  caveats: string[];
  /** Snapshot holder dasar peta; `null` bila peta dibentuk tanpa snapshot. */
  snapshot: { id: number; fetchedAt: string; blockNumber: number; sources: string[] } | null;
  /** Status sekarang; `stale` bila snapshot dasarnya sudah terlalu lama. */
  dataStatus: DataStatus;
}

/** Detail satu garis peta beserta bukti transaksinya. */
export interface WalletMapEdgeDetailResponse {
  chain: FlowChainInfo;
  token: { address: string; symbol: string | null };
  map: { id: number; builtAt: string; status: DataStatus };
  edge: WalletMapEdgeView & {
    /** Jenis perpindahan dan dasarnya; `null` bila belum diklasifikasikan. */
    movement: MovementTypeView | null;
  };
  from: WalletMapPartyView;
  to: WalletMapPartyView;
  /** Garis lain di peta yang sama antara dua wallet ini, ke dua arah. */
  relatedEdges: WalletMapEdgeView[];
  /** Semua perpindahan dana di transaksi garis ini, beserta klaim yang memakainya. */
  transaction: TransactionEvidenceResponse;
  caveats: string[];
}
