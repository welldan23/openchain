/**
 * Peringkat holder dan konsentrasi supply dari saldo pada blok snapshot.
 * Semua hitungan memakai BigInt supaya saldo uint256 tidak kehilangan presisi.
 */
import type { ExternalLabel } from '../providers/provider.types.js';
import type { CollectedHolder } from './chain-adapter.types.js';

export interface HolderBalance {
  address: string;
  isContract: boolean | null;
  labels: ExternalLabel[];
  balance: bigint;
}

export type HolderDistribution =
  | { ok: true; holders: CollectedHolder[]; concentration: { top10Pct: string; top50Pct: string } }
  | { ok: false; reason: string };

/** Persen `part / total` dengan `scale` angka di belakang koma, dibulatkan ke bawah. */
export function percentOf(part: bigint, total: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale);
  const scaled = (part * 100n * factor) / total;
  return `${scaled / factor}.${(scaled % factor).toString().padStart(scale, '0')}`;
}

/**
 * Urutkan holder dari saldo terbesar (saldo nol dibuang), lalu hitung porsi
 * tiap holder dan konsentrasi 10 dan 50 holder teratas. Konsentrasi ini masih
 * mentah: pool likuiditas, address burn, dan exchange belum dikecualikan.
 */
export function distributeHolders(entries: HolderBalance[], totalSupply: bigint): HolderDistribution {
  if (totalSupply <= 0n) return { ok: false, reason: 'Total supply nol, porsi holder tidak bisa dihitung' };
  const ranked = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.balance > 0n)
    .sort((a, b) => {
      if (a.entry.balance === b.entry.balance) return a.index - b.index;
      return a.entry.balance > b.entry.balance ? -1 : 1;
    })
    .map(({ entry }) => entry);
  const sum = (items: HolderBalance[]) => items.reduce((total, item) => total + item.balance, 0n);
  if (sum(ranked) > totalSupply) {
    return { ok: false, reason: 'Jumlah saldo holder melebihi total supply' };
  }
  return {
    ok: true,
    holders: ranked.map((entry, index) => ({
      address: entry.address,
      isContract: entry.isContract,
      labels: entry.labels,
      rank: index + 1,
      balanceRaw: entry.balance.toString(),
      sharePct: percentOf(entry.balance, totalSupply, 6),
    })),
    concentration: {
      top10Pct: percentOf(sum(ranked.slice(0, 10)), totalSupply, 4),
      top50Pct: percentOf(sum(ranked.slice(0, 50)), totalSupply, 4),
    },
  };
}
