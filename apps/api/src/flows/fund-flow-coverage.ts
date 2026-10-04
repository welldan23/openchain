/**
 * Menghitung cakupan pemindaian aliran dana secara jujur.
 *
 * Indexer membaca dari transaksi terbaru ke belakang. Bila riwayat satu jenis
 * transfer tidak habis dibaca (dibatasi jumlah halaman), cakupannya hanya
 * sampai blok item tertua yang terbaca, dan blok itu sendiri dianggap belum
 * lengkap karena halaman bisa terpotong di tengah blok. Rentang gabungan
 * adalah bagian yang lengkap untuk SEMUA jenis yang berhasil dipindai, jadi
 * transfer di luar rentang tidak boleh dianggap tidak ada.
 */
import type { IndexedNativeTransfer, IndexedTokenTransfer } from '../providers/provider.types.js';
import {
  FLOW_TRANSFER_KINDS,
  MISSING_FIELD,
  type ChainHead,
  type FlowScan,
  type FlowTransferKind,
  type KindCoverage,
} from './fund-flow.types.js';

const KIND_NAME: Record<FlowTransferKind, string> = {
  native: 'transfer native',
  internal: 'transfer internal',
  tokens: 'transfer token',
};

interface CoverageInput {
  coverage: Record<FlowTransferKind, KindCoverage>;
  head: ChainHead | null;
  nativeTransfers: readonly IndexedNativeTransfer[];
  tokenTransfers: readonly IndexedTokenTransfer[];
}

/** Blok pertama yang lengkap untuk satu jenis transfer. */
function startBlock(coverage: KindCoverage, blockTo: number): number {
  if (coverage.exhausted) return 0;
  // Halaman terakhir bisa terpotong di tengah blok item tertua.
  return coverage.oldest ? Math.min(coverage.oldest.blockNumber + 1, blockTo) : blockTo;
}

export function summarizeCoverage({ coverage, head, nativeTransfers, tokenTransfers }: CoverageInput): FlowScan | null {
  const items = [...nativeTransfers, ...tokenTransfers];
  const latestItem = items.reduce<ChainHead | null>(
    (latest, item) =>
      !latest || item.blockNumber > latest.blockNumber ? { blockNumber: item.blockNumber, timestamp: item.timestamp } : latest,
    null,
  );
  const top = head ?? latestItem;
  if (!top) return null;

  const scanned = FLOW_TRANSFER_KINDS.filter((kind) => coverage[kind].failure === null);
  const failed = FLOW_TRANSFER_KINDS.filter((kind) => coverage[kind].failure !== null);

  // Bagian yang lengkap untuk semua jenis yang berhasil dipindai.
  let blockFrom = scanned.length === 0 ? top.blockNumber : 0;
  let limiting: KindCoverage | null = null;
  for (const kind of scanned) {
    const start = startBlock(coverage[kind], top.blockNumber);
    if (start > blockFrom) {
      blockFrom = start;
      limiting = coverage[kind];
    }
  }

  let windowFrom: Date;
  if (limiting?.oldest) windowFrom = limiting.oldest.timestamp;
  else {
    // Riwayat habis dibaca: rentang waktu dimulai dari item tertua yang terbaca
    // (termasuk transaksi tanpa nilai), atau blok terbaru bila tidak ada sama sekali.
    const seen = [
      ...items.map((item) => item.timestamp.getTime()),
      ...scanned.flatMap((kind) => (coverage[kind].oldest ? [coverage[kind].oldest.timestamp.getTime()] : [])),
    ];
    windowFrom = blockFrom === 0 && seen.length > 0 ? new Date(Math.min(...seen)) : top.timestamp;
  }
  if (windowFrom > top.timestamp) windowFrom = top.timestamp;

  // Jenis yang gagal karena alasan yang sama digabung dalam satu kalimat.
  const byReason = new Map<string, FlowTransferKind[]>();
  for (const kind of failed) {
    const reason = coverage[kind].failure ?? '';
    byReason.set(reason, [...(byReason.get(reason) ?? []), kind]);
  }
  const reasons = [...byReason].map(([reason, kinds]) => `${kinds.map((kind) => KIND_NAME[kind]).join(', ')}: ${reason}.`);
  if (!head) reasons.push('Blok terbaru chain tidak terbaca; batas atas memakai transfer terbaru yang ditemukan.');
  const capitalized = reasons.map((reason) => reason.charAt(0).toUpperCase() + reason.slice(1));
  // Tanpa blok terbaru, batas atas cakupan hanya perkiraan: belum boleh disebut lengkap.
  const status = scanned.length === 0 ? 'unavailable' : failed.length > 0 || !head ? 'partial' : 'complete';

  return {
    blockFrom,
    blockTo: top.blockNumber,
    windowFrom,
    windowTo: top.timestamp,
    nativeScanned: coverage.native.failure === null,
    internalScanned: coverage.internal.failure === null,
    tokensScanned: coverage.tokens.failure === null,
    status,
    statusReason: status === 'complete' ? null : capitalized.join(' '),
    missingFields: [...failed.map((kind) => MISSING_FIELD[kind]), ...(head ? [] : ['chain_head'])],
  };
}
