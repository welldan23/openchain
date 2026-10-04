/**
 * Deteksi gerak serempak di antara holder Peta Hubungan Wallet (heuristic
 * `openchain-coordination-v1`):
 * - `funding_burst`: satu pendana mendanai ≥3 holder dalam 10 menit (pola Sybil);
 * - `similar_amount`: satu pendana mengirim jumlah yang hampir sama (selisih
 *   ≤1%) ke ≥3 holder;
 * - `same_block_buy`: ≥2 holder membeli token di blok yang sama (pola bundler);
 * - `coordinated_sell`: ≥2 holder menjual token dalam 5 menit.
 *
 * "Beli" = menerima token peta dari pool, router, atau kontrak; "jual" =
 * mengirimnya ke sana. Pendana exchange/hub tidak dihitung, karena penarikan
 * dari exchange memang sering beruntun. Setiap kejadian menunjuk transfer
 * tersimpan sebagai bukti dan selalu berklasifikasi `heuristic`: gerak
 * serempak bisa juga kebetulan saat token sedang ramai.
 */
import type { ConfidenceLevel, CoordinationAction, CoordinationKind } from '../database/schema/enums.js';
import type { TransferRef } from './maps.repository.js';

export const COORDINATION_HEURISTIC = 'openchain-coordination-v1';
export const FUNDING_BURST_SECONDS = 600;
export const SELL_WINDOW_SECONDS = 300;
/** Selisih jumlah maksimal untuk disebut mirip, dalam per seribu. */
const SIMILAR_AMOUNT_PERMILLE = 10n;
/** Batas kejadian per jenis supaya respons tetap ringkas. */
export const MAX_EVENTS_PER_KIND = 20;

/** Satu langkah holder: didanai, membeli, atau menjual. */
export interface HolderMove {
  holderNodeId: number;
  ref: TransferRef;
  blockNumber: number;
  timestamp: Date;
}

export interface FundingMove extends HolderMove {
  funderNodeId: number;
  /** Jumlah dalam satuan terkecil. */
  amountRaw: string;
}

export interface CoordinationInput {
  fundings: readonly FundingMove[];
  buys: readonly HolderMove[];
  sells: readonly HolderMove[];
  /** Address pendek untuk kalimat penjelasan. */
  addressOf: (nodeId: number) => string;
}

export interface DetectedEvent {
  key: string;
  kind: CoordinationKind;
  detail: string;
  confidence: ConfidenceLevel;
  startedAt: Date;
  windowSeconds: number;
  /** Diisi bila semua transaksinya di satu blok. */
  blockNumber: number | null;
  memberNodeIds: number[];
  txs: Array<{ action: CoordinationAction; ref: TransferRef }>;
}

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function duration(seconds: number): string {
  if (seconds === 0) return 'di blok yang sama';
  return seconds < 60 ? `dalam ${seconds} detik` : `dalam ${Math.round(seconds / 60)} menit`;
}

function groupBy<T>(items: readonly T[], key: (item: T) => number): Map<number, T[]> {
  const result = new Map<number, T[]>();
  for (const item of items) result.set(key(item), [...(result.get(key(item)) ?? []), item]);
  return result;
}

function holdersOf(moves: readonly HolderMove[]): number[] {
  return [...new Set(moves.map((move) => move.holderNodeId))].sort((a, b) => a - b);
}

function event(kind: CoordinationKind, keyPart: string, moves: readonly HolderMove[], action: CoordinationAction, detail: string, confidence: ConfidenceLevel): DetectedEvent {
  const sorted = [...moves].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.blockNumber - b.blockNumber);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const sameBlock = sorted.every((move) => move.blockNumber === first.blockNumber);
  return {
    key: `${kind}:${keyPart}`,
    kind,
    detail,
    confidence,
    startedAt: first.timestamp,
    windowSeconds: Math.max(0, Math.round((last.timestamp.getTime() - first.timestamp.getTime()) / 1000)),
    blockNumber: sameBlock ? first.blockNumber : null,
    memberNodeIds: holdersOf(sorted),
    txs: sorted.map((move) => ({ action, ref: move.ref })),
  };
}

/** Rentang waktu (≤ `seconds`) dengan holder berbeda terbanyak; satu langkah pertama per holder. */
function densest<T extends HolderMove>(moves: readonly T[], seconds: number): T[] {
  const firstPerHolder = [...groupBy(moves, (move) => move.holderNodeId).values()].map(
    (items) => [...items].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0],
  );
  const sorted = firstPerHolder.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let best: T[] = [];
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[end].timestamp.getTime() - sorted[start].timestamp.getTime() > seconds * 1000) start++;
    if (end - start + 1 > best.length) best = sorted.slice(start, end + 1);
  }
  return best;
}

/** Kelompok jumlah terbesar yang selisih terbesarnya ≤1% dari yang terkecil; satu kiriman per holder. */
function similarAmounts(moves: readonly FundingMove[]): FundingMove[] {
  const sorted = [...moves].sort((a, b) => (BigInt(a.amountRaw) < BigInt(b.amountRaw) ? -1 : BigInt(a.amountRaw) > BigInt(b.amountRaw) ? 1 : 0));
  let best: FundingMove[] = [];
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (BigInt(sorted[end].amountRaw) * 1000n > BigInt(sorted[start].amountRaw) * (1000n + SIMILAR_AMOUNT_PERMILLE)) start++;
    const window = sorted.slice(start, end + 1);
    const perHolder = [...groupBy(window, (move) => move.holderNodeId).values()].map((items) => items[0]);
    if (perHolder.length > best.length) best = perHolder;
  }
  return best;
}

export function detectCoordination(input: CoordinationInput): DetectedEvent[] {
  const events: DetectedEvent[] = [];
  const top = (items: DetectedEvent[]) =>
    items.sort((a, b) => b.memberNodeIds.length - a.memberNodeIds.length || a.startedAt.getTime() - b.startedAt.getTime()).slice(0, MAX_EVENTS_PER_KIND);

  const byFunder = groupBy(input.fundings, (move) => move.funderNodeId);
  const bursts: DetectedEvent[] = [];
  const similar: DetectedEvent[] = [];
  for (const [funder, moves] of byFunder) {
    const funderAddress = short(input.addressOf(funder));
    const burst = densest(moves, FUNDING_BURST_SECONDS);
    if (burst.length >= 3) {
      const built = event('funding_burst', `${input.addressOf(funder).toLowerCase()}:${burst[0].blockNumber}`, burst, 'funding', '', burst.length >= 5 ? 'high' : 'medium');
      built.detail = `${burst.length} wallet didanai ${funderAddress} ${duration(built.windowSeconds)}.`;
      bursts.push(built);
    }
    const alike = similarAmounts(moves);
    if (alike.length >= 3) {
      const built = event('similar_amount', `${input.addressOf(funder).toLowerCase()}:${alike[0].amountRaw}`, alike, 'funding', '', alike.length >= 5 ? 'medium' : 'low');
      built.detail = `${alike.length} wallet menerima jumlah yang hampir sama (selisih ≤1%) dari ${funderAddress}.`;
      similar.push(built);
    }
  }

  const sameBlock: DetectedEvent[] = [];
  for (const [block, moves] of groupBy(input.buys, (move) => move.blockNumber)) {
    const holders = holdersOf(moves);
    if (holders.length < 2) continue;
    sameBlock.push(event('same_block_buy', String(block), moves, 'buy', `${holders.length} wallet membeli token di blok ${block}.`, holders.length >= 3 ? 'high' : 'medium'));
  }

  const sells: DetectedEvent[] = [];
  const sortedSells = [...input.sells].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (let start = 0; start < sortedSells.length; ) {
    let end = start;
    while (end + 1 < sortedSells.length && sortedSells[end + 1].timestamp.getTime() - sortedSells[start].timestamp.getTime() <= SELL_WINDOW_SECONDS * 1000) end++;
    const window = sortedSells.slice(start, end + 1);
    const holders = holdersOf(window);
    if (holders.length >= 2) {
      const built = event('coordinated_sell', String(window[0].blockNumber), window, 'sell', '', 'medium');
      built.confidence = built.blockNumber !== null || holders.length >= 3 ? 'high' : 'medium';
      built.detail = `${holders.length} wallet menjual token ${duration(built.windowSeconds)}.`;
      sells.push(built);
    }
    start = end + 1;
  }

  events.push(...top(bursts), ...top(similar), ...top(sameBlock), ...top(sells));
  return events;
}
