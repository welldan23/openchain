/**
 * Pilihan filter label: jenis, sumber, dan chain, dihitung dari label utama
 * tiap address tersimpan (eksternal dulu, lalu dugaan, lalu user), sama
 * dengan aturan filter di peta dan pencarian. Pilihan diambil dari semua data
 * supaya pilihan yang sedang aktif tidak hilang; jumlah di tiap dimensi
 * dihitung dengan filter dimensi lain tetap berlaku.
 */
import { entityLabelType, labelSource, type EntityLabelType, type LabelSource } from '../database/schema/enums.js';
import type { LabelOptionsResponse, LabelSourceFilter } from './search.types.js';

/** Jumlah address per kombinasi label utama. */
export interface PrimaryLabelCount {
  chainId: string;
  type: EntityLabelType;
  source: LabelSource;
  sourceName: string;
  count: number;
}

export interface LabelOptionFilters {
  chains: string[];
  labelSource: LabelSourceFilter;
}

const TYPE_ORDER: readonly string[] = entityLabelType.enumValues;
const SOURCE_ORDER: readonly string[] = labelSource.enumValues;

const sum = (rows: readonly PrimaryLabelCount[]) => rows.reduce((total, row) => total + row.count, 0);

export function labelOptions(rows: readonly PrimaryLabelCount[], filters: LabelOptionFilters, chainRank: (chainId: string) => number): Omit<LabelOptionsResponse, 'caveats'> {
  const inChain = (row: PrimaryLabelCount) => filters.chains.length === 0 || filters.chains.includes(row.chainId);
  const inSource = (row: PrimaryLabelCount) => filters.labelSource === 'all' || row.source === filters.labelSource;
  const byChain = rows.filter(inChain);
  const filtered = byChain.filter(inSource);

  const types = [...new Set(rows.map((row) => row.type))]
    .map((type) => {
      const bySource = { external: 0, heuristic: 0, user: 0 } as Record<LabelSource, number>;
      for (const row of byChain) if (row.type === type) bySource[row.source] += row.count;
      return { type, count: sum(filtered.filter((row) => row.type === type)), bySource };
    })
    .sort((a, b) => b.count - a.count || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

  const sources = [...new Set(rows.map((row) => row.source))]
    .sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b))
    .map((source) => {
      const providers = new Map<string, number>();
      for (const row of byChain) if (row.source === source) providers.set(row.sourceName, (providers.get(row.sourceName) ?? 0) + row.count);
      return {
        source,
        count: sum(byChain.filter((row) => row.source === source)),
        providers: [...providers]
          .filter(([, count]) => count > 0)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      };
    });

  const bySourceOnly = rows.filter(inSource);
  const chains = [...new Set(rows.map((row) => row.chainId))]
    .map((chain) => ({ chain, count: sum(bySourceOnly.filter((row) => row.chainId === chain)) }))
    .sort((a, b) => chainRank(a.chain) - chainRank(b.chain) || a.chain.localeCompare(b.chain));

  return { filters, labeledAddresses: sum(filtered), types, sources, chains };
}
