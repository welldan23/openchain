/**
 * Kontrak respons `GET /api/traces/:chain/:from/:to`.
 *
 * Tiap langkah adalah transfer on-chain (`verified_fact`). Anggapan bahwa
 * dana yang sama berpindah dari langkah ke langkah adalah dugaan, jadi jalur
 * secara keseluruhan berklasifikasi `heuristic`. Jalur yang tidak ditemukan
 * berarti tidak ada dalam data yang sudah dipindai, bukan pasti tidak ada.
 */
import type { DataStatus } from '../database/schema/enums.js';
import type { FlowAsset, FlowChainInfo, FlowLabelView, MovementTypeView } from './flow-summary.types.js';

export interface TraceParty {
  /** Identifier asli address. */
  address: string;
  labels: FlowLabelView[];
  /** Address ini pernah dipindai, jadi transfer keluarnya tercatat. */
  scanned: boolean;
}

export interface TraceHopView {
  index: number;
  from: TraceParty;
  to: TraceParty;
  transferKind: 'native' | 'internal' | 'token';
  asset: FlowAsset;
  amountRaw: string;
  amount: string | null;
  amountUsd: number | null;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  classification: 'verified_fact';
  /** Jenis perpindahan dan dasarnya; `null` bila belum diklasifikasikan. */
  movement: MovementTypeView | null;
}

export interface TraceResponse {
  chain: FlowChainInfo;
  from: TraceParty;
  to: TraceParty;
  maxHops: number;
  throughHubs: boolean;
  found: boolean;
  /** Kosong bila tidak ditemukan dalam batas langkah. */
  hops: TraceHopView[];
  pathClassification: 'heuristic';
  /** Hal yang bisa membuat jalur keliru atau tidak lengkap, dalam bahasa sederhana. */
  caveats: string[];
  search: {
    addressesVisited: number;
    transfersExamined: number;
    /** Pencarian dipotong batas per address atau batas kunjungan. */
    truncated: boolean;
    /** Address yang dilewati pencarian tapi belum pernah dipindai. */
    unscannedAddresses: number;
    /** Hub yang ditemui tapi tidak ditelusuri lebih jauh. */
    hubsSkipped: number;
  };
  dataStatus: DataStatus;
}
