/**
 * Perbandingan aktivitas satu address antar chain, dari profil multichain.
 *
 * Aturannya sama dengan halaman Jelajah Multichain, dengan satu perbedaan:
 * nilai yang belum diketahui tetap `null`, tidak dijadikan nol. Chain yang
 * tidak terbaca tidak dihitung aktif maupun tidak aktif, dan tidak ikut
 * dijumlahkan.
 */
import type { DataStatus } from '../database/schema/enums.js';
import type { BridgeMoveView, MultichainChainView } from './multichain.types.js';

export const COMPARISON_KEYS = ['chain', 'txCount', 'inUsd', 'outUsd', 'netUsd', 'counterpartyCount', 'firstSeen', 'lastSeen'] as const;
export type ComparisonKey = (typeof COMPARISON_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

export interface ComparisonRow {
  chain: string;
  chainName: string;
  active: boolean;
  status: DataStatus;
  statusReason: string | null;
  txCount: number | null;
  /** Porsi transaksi dari total chain aktif, dalam persen; `null` bila chain tidak terbaca. */
  txSharePct: number | null;
  inUsd: number | null;
  outUsd: number | null;
  /** Masuk dikurangi keluar; hanya bila semua transfer chain ini punya harga. */
  netUsd: number | null;
  unpricedCount: number | null;
  counterpartyCount: number | null;
  /** Saldo belum diambil; selalu `null` untuk sementara. */
  balanceUsd: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  bridgesOut: number;
  /** Penerimaan bridge yang sudah dicocokkan ke chain ini. */
  bridgesIn: number;
}

export interface ComparisonSummary {
  activeChains: string[];
  /** Terbaca tapi tanpa transaksi. */
  inactiveChains: string[];
  unavailableChains: string[];
  staleChains: string[];
  /** Total transaksi chain aktif. */
  totalTx: number;
  /** Jumlah USD transfer berharga di chain aktif; `null` bila tidak ada yang berharga. */
  inUsd: number | null;
  outUsd: number | null;
  busiestChain: string | null;
  bridgeCount: number;
  /** Kiriman bridge yang belum ketemu pasangannya. */
  unmatchedBridges: number;
}

export type ComparisonLeaders = Partial<Record<Exclude<ComparisonKey, 'chain' | 'firstSeen' | 'lastSeen'>, string>>;

const round2 = (value: number) => Math.round(value * 100) / 100;

function isActive(view: MultichainChainView): boolean {
  return view.status !== 'unavailable' && (view.txCount ?? 0) > 0;
}

function rank(row: ComparisonRow): number {
  if (row.status === 'unavailable') return 2;
  return row.active ? 0 : 1;
}

export function comparisonRows(chains: readonly MultichainChainView[], bridges: readonly BridgeMoveView[]): ComparisonRow[] {
  const totalTx = chains.filter(isActive).reduce((sum, view) => sum + (view.txCount ?? 0), 0);
  return chains.map((view) => {
    const readable = view.status !== 'unavailable';
    const allPriced = readable && view.unpricedCount === 0;
    return {
      chain: view.chain.id,
      chainName: view.chain.name,
      active: isActive(view),
      status: view.status,
      statusReason: view.statusReason,
      txCount: view.txCount,
      txSharePct: !readable ? null : totalTx > 0 && isActive(view) ? round2(((view.txCount ?? 0) / totalTx) * 100) : 0,
      inUsd: view.inUsd,
      outUsd: view.outUsd,
      netUsd: allPriced ? round2((view.inUsd ?? 0) - (view.outUsd ?? 0)) : null,
      unpricedCount: view.unpricedCount,
      counterpartyCount: view.counterpartyCount,
      balanceUsd: view.balanceUsd,
      firstSeen: view.firstSeen,
      lastSeen: view.lastSeen,
      bridgesOut: bridges.filter((move) => move.fromChain === view.chain.id).length,
      bridgesIn: bridges.filter((move) => move.toChain === view.chain.id && move.status === 'matched').length,
    };
  });
}

function sortValue(row: ComparisonRow, key: ComparisonKey): number | string | null {
  if (key === 'chain') return row.chain;
  if (key === 'firstSeen' || key === 'lastSeen') return row[key] ? Date.parse(row[key]) : null;
  return row[key];
}

/** Chain tidak aktif dan tidak terbaca selalu di bawah; nilai kosong di bawah nilai yang ada. */
export function sortComparison(rows: readonly ComparisonRow[], key: ComparisonKey, direction: SortDirection): ComparisonRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) return Number(va === null) - Number(vb === null) || a.chain.localeCompare(b.chain);
    const diff = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
    return diff * sign || a.chain.localeCompare(b.chain);
  });
}

/** Chain aktif dengan nilai tertinggi per kolom angka; kolom tanpa nilai positif tidak punya juara. */
export function columnLeaders(rows: readonly ComparisonRow[]): ComparisonLeaders {
  const keys = ['txCount', 'inUsd', 'outUsd', 'netUsd', 'counterpartyCount'] as const;
  const leaders: ComparisonLeaders = {};
  for (const key of keys) {
    const best = rows
      .filter((row) => row.active && row[key] !== null)
      .reduce<ComparisonRow | null>((top, row) => (top === null || (row[key] as number) > (top[key] as number) ? row : top), null);
    if (best && (best[key] as number) > 0) leaders[key] = best.chain;
  }
  return leaders;
}

export function summarizeComparison(rows: readonly ComparisonRow[], bridges: readonly BridgeMoveView[]): ComparisonSummary {
  const active = rows.filter((row) => row.active);
  const busiest = [...active].sort((a, b) => (b.txCount ?? 0) - (a.txCount ?? 0) || a.chain.localeCompare(b.chain))[0];
  const sum = (key: 'inUsd' | 'outUsd') => {
    const priced = active.filter((row) => row[key] !== null);
    return priced.length === 0 ? null : round2(priced.reduce((total, row) => total + (row[key] ?? 0), 0));
  };
  return {
    activeChains: active.map((row) => row.chain),
    inactiveChains: rows.filter((row) => !row.active && row.status !== 'unavailable').map((row) => row.chain),
    unavailableChains: rows.filter((row) => row.status === 'unavailable').map((row) => row.chain),
    staleChains: rows.filter((row) => row.status === 'stale').map((row) => row.chain),
    totalTx: active.reduce((total, row) => total + (row.txCount ?? 0), 0),
    inUsd: sum('inUsd'),
    outUsd: sum('outUsd'),
    busiestChain: busiest?.chain ?? null,
    bridgeCount: bridges.length,
    unmatchedBridges: bridges.filter((move) => move.status !== 'matched').length,
  };
}
