/**
 * Kontrak respons `GET /api/multichain/:address`: aktivitas satu address EVM
 * di semua chain EVM. Angka yang belum diketahui `null`, bukan nol: chain yang
 * belum dipindai tidak sama dengan chain tanpa aktivitas.
 */
import type { BridgeMatchStatus, ConfidenceLevel, DataStatus } from '../database/schema/enums.js';
import type { FlowAsset, FlowChainInfo, FlowLabelView } from '../flows/flow-summary.types.js';

export interface MultichainChainView {
  chain: FlowChainInfo;
  /** Address ini pernah dicatat di chain ini. */
  known: boolean;
  status: DataStatus;
  statusReason: string | null;
  /** Pemindaian aliran dana yang jadi dasar angka di sini. */
  flowScanId: number | null;
  txCount: number | null;
  inCount: number | null;
  outCount: number | null;
  /** Jumlah USD dari transfer yang punya harga saat transaksi; `null` bila tidak ada. */
  inUsd: number | null;
  outUsd: number | null;
  unpricedCount: number | null;
  counterpartyCount: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Saldo native belum diambil; selalu `null` sampai sumbernya ada. */
  nativeBalanceRaw: string | null;
  balanceUsd: number | null;
  /** Blok teratas cakupan pemindaian. */
  snapshotBlock: number | null;
  fetchedAt: string | null;
}

export type CrossChainActivityKind = 'in' | 'out' | 'self' | 'bridge_out' | 'bridge_in';

export interface CrossChainActivityView {
  /** Kunci transfer, mis. `ethereum:native:12`. */
  id: string;
  chain: string;
  kind: CrossChainActivityKind;
  timestamp: string;
  blockNumber: number;
  counterparty: string;
  counterpartyLabels: FlowLabelView[];
  transferKind: 'native' | 'internal' | 'token';
  asset: FlowAsset;
  amountRaw: string;
  amount: string | null;
  amountUsd: number | null;
  txHash: string;
  /** Id perpindahan bridge bila transfer ini salah satu kakinya. */
  bridgeId: number | null;
  classification: 'verified_fact';
}

export interface BridgeMoveView {
  id: number;
  fromChain: string;
  toChain: string;
  protocolId: string | null;
  bridgeAddress: string;
  status: BridgeMatchStatus;
  amountSentRaw: string;
  amountReceivedRaw: string | null;
  amountUsd: number | null;
  sentTxHash: string;
  sentAt: string;
  receivedTxHash: string | null;
  receivedAt: string | null;
  /** Pencocokan kaki kirim dan terima selalu dugaan. */
  matchClassification: 'heuristic';
  matchConfidence: ConfidenceLevel | null;
  matchReason: string | null;
}

export interface MultichainProfileResponse {
  address: string;
  family: 'evm';
  /** Label address ini dari chain mana pun, eksternal dulu. */
  labels: FlowLabelView[];
  /** Ringkasan tersimpan; `null` bila respons ini disaring (chain atau waktu) dan tidak disimpan. */
  scan: { id: number; scannedAt: string; reused: boolean } | null;
  /** Rentang waktu yang dipakai; `null` bila belum ada chain yang dipindai. */
  window: { from: string; to: string } | null;
  chains: MultichainChainView[];
  activities: CrossChainActivityView[];
  activityPage: { limit: number; truncated: boolean };
  bridges: BridgeMoveView[];
  /** Provider yang mencatat data pemindaian yang dipakai. */
  sources: string[];
  status: DataStatus;
  statusReason: string | null;
  caveats: string[];
}
