/**
 * Kontrak respons `GET /api/maps/:chain/:token`.
 *
 * Wallet dan garis adalah fakta: holder dari snapshot, garis dari transfer
 * on-chain tersimpan (`verified_fact`). Kedekatan di peta bukan bukti bahwa
 * wallet dimiliki orang yang sama; pengelompokan wallet adalah dugaan dan
 * disajikan terpisah.
 */
import type { DataStatus, MapEdgeKind, MapNodeRole } from '../database/schema/enums.js';
import type { FlowAsset, FlowChainInfo, FlowLabelView } from '../flows/flow-summary.types.js';

export interface WalletMapNodeView {
  /** Identifier asli address. */
  address: string;
  role: MapNodeRole;
  /** Persen supply pada snapshot dasar; 0 untuk pendana dan penghubung. */
  sharePct: number;
  /** `null` bila belum diketahui. */
  isContract: boolean | null;
  labels: FlowLabelView[];
  /** Langkah dari holder terdekat; holder 0. */
  distance: number;
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
  /** Hal yang bisa membuat peta keliru atau tidak lengkap, dalam bahasa sederhana. */
  caveats: string[];
  /** Snapshot holder dasar peta; `null` bila peta dibentuk tanpa snapshot. */
  snapshot: { id: number; fetchedAt: string; blockNumber: number; sources: string[] } | null;
  /** Status sekarang; `stale` bila snapshot dasarnya sudah terlalu lama. */
  dataStatus: DataStatus;
}
