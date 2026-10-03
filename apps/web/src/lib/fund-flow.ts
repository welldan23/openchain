/**
 * Logika halaman Lacak Aliran Dana: menjumlahkan dana masuk dan keluar,
 * lalu mengelompokkan transfer per lawan transaksi.
 *
 * Transfer tanpa harga USD tidak ikut dijumlahkan dan tidak ditebak nilainya;
 * jumlahnya dicatat terpisah supaya tampilan bisa menyebutkannya.
 */
import { getChain } from "./chains";
import { ENTITY_LABEL_META } from "./labels";
import type { ChainId, EntityLabel, FlowDirection, FlowTransfer } from "./types";

export interface FlowTotals {
  inUsd: number;
  outUsd: number;
  /** Masuk dikurangi keluar; negatif berarti lebih banyak dana keluar. */
  netUsd: number;
  inCount: number;
  outCount: number;
  /** Transfer yang harga asetnya tidak diketahui, jadi tidak ikut dijumlahkan. */
  unpricedCount: number;
  counterpartyCount: number;
}

export interface CounterpartyFlow {
  address: string;
  label?: EntityLabel;
  totalUsd: number;
  transferCount: number;
  unpricedCount: number;
  /** Simbol aset yang berpindah, urut kemunculan pertama. */
  assets: string[];
  lastAt: string;
}

/** Address EVM tidak case-sensitive, address Solana case-sensitive. */
export function addressKey(chain: ChainId, address: string): string {
  return getChain(chain).addressFormat === "evm" ? address.toLowerCase() : address;
}

/** Nama tampilan address: nama label, jenis label, atau keterangan tanpa label. */
export function addressTitle(label: EntityLabel | undefined): string {
  if (!label) return "Address tanpa label";
  return label.name ?? ENTITY_LABEL_META[label.type].label;
}

/** Bulatkan ke sen supaya penjumlahan desimal tidak menyisakan angka aneh. */
function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasPrice(transfer: FlowTransfer): transfer is FlowTransfer & { amountUsd: number } {
  return transfer.amountUsd !== undefined && Number.isFinite(transfer.amountUsd);
}

export function summarizeFlow(chain: ChainId, transfers: FlowTransfer[]): FlowTotals {
  let inUsd = 0;
  let outUsd = 0;
  let inCount = 0;
  let outCount = 0;
  let unpricedCount = 0;
  const counterparties = new Set<string>();
  for (const transfer of transfers) {
    counterparties.add(addressKey(chain, transfer.counterparty));
    if (transfer.direction === "in") inCount += 1;
    else outCount += 1;
    if (!hasPrice(transfer)) {
      unpricedCount += 1;
      continue;
    }
    if (transfer.direction === "in") inUsd += transfer.amountUsd;
    else outUsd += transfer.amountUsd;
  }
  return {
    inUsd: roundUsd(inUsd),
    outUsd: roundUsd(outUsd),
    netUsd: roundUsd(inUsd - outUsd),
    inCount,
    outCount,
    unpricedCount,
    counterpartyCount: counterparties.size,
  };
}

/**
 * Lawan transaksi terbesar untuk satu arah: sumber dana (`in`) atau tujuan
 * dana (`out`). Diurutkan dari nilai USD terbesar, lalu jumlah transfer.
 */
export function topCounterparties(
  chain: ChainId,
  transfers: FlowTransfer[],
  direction: FlowDirection,
  limit = 5,
): CounterpartyFlow[] {
  const groups = new Map<string, CounterpartyFlow>();
  for (const transfer of transfers) {
    if (transfer.direction !== direction) continue;
    const key = addressKey(chain, transfer.counterparty);
    const group = groups.get(key) ?? {
      address: transfer.counterparty,
      label: transfer.counterpartyLabel,
      totalUsd: 0,
      transferCount: 0,
      unpricedCount: 0,
      assets: [],
      lastAt: transfer.timestamp,
    };
    group.transferCount += 1;
    group.label ??= transfer.counterpartyLabel;
    if (hasPrice(transfer)) group.totalUsd = roundUsd(group.totalUsd + transfer.amountUsd);
    else group.unpricedCount += 1;
    if (!group.assets.includes(transfer.asset.symbol)) group.assets.push(transfer.asset.symbol);
    if (Date.parse(transfer.timestamp) > Date.parse(group.lastAt)) group.lastAt = transfer.timestamp;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.totalUsd - a.totalUsd ||
        b.transferCount - a.transferCount ||
        a.address.localeCompare(b.address),
    )
    .slice(0, limit);
}

/** Transfer terbaru di atas; urutan transfer di blok yang sama dipertahankan. */
export function sortTransfersNewestFirst(transfers: FlowTransfer[]): FlowTransfer[] {
  return transfers
    .map((transfer, index) => ({ transfer, index }))
    .sort((a, b) => Date.parse(b.transfer.timestamp) - Date.parse(a.transfer.timestamp) || a.index - b.index)
    .map(({ transfer }) => transfer);
}

export type DirectionFilter = FlowDirection | "all";

/** Transfer untuk satu tab daftar, beserta jumlah USD dari yang ada harganya. */
export function filterTransfers(
  transfers: FlowTransfer[],
  filter: DirectionFilter,
): { items: FlowTransfer[]; totalUsd: number; unpricedCount: number } {
  const items = filter === "all" ? transfers : transfers.filter((item) => item.direction === filter);
  let totalUsd = 0;
  let unpricedCount = 0;
  for (const item of items) {
    if (!hasPrice(item)) unpricedCount += 1;
    // Di tab "Semua", dana keluar mengurangi total supaya hasilnya sama dengan selisih.
    else totalUsd += filter === "all" && item.direction === "out" ? -item.amountUsd : item.amountUsd;
  }
  return { items, totalUsd: roundUsd(totalUsd), unpricedCount };
}
