/**
 * Filter tampilan Peta Hubungan Wallet.
 *
 * Urutannya: garis disaring dulu menurut waktu dan jenisnya, lalu peta
 * dipotong ke radius (wallet yang tak lagi terhubung ikut hilang), lalu
 * wallet disaring menurut label utamanya. Label utama adalah label pertama
 * (eksternal dulu); wallet tanpa label masuk kelompok `none`. Bila sumber label
 * dipilih, wallet tanpa label ikut tersembunyi karena tidak punya sumber.
 * Garis yang salah satu ujungnya tersembunyi ikut disembunyikan.
 */
import type { MapEdgeKind } from '../database/schema/enums.js';
import type { FlowLabelView } from '../flows/flow-summary.types.js';

export type LabelSourceFilter = 'all' | 'external' | 'heuristic';

export interface MapFilter {
  /** Jenis label utama yang disembunyikan; `none` = wallet tanpa label. */
  hide: ReadonlySet<string>;
  labelSource: LabelSourceFilter;
  /** Rentang waktu transfer garis (inklusif). */
  from?: Date;
  to?: Date;
  /** Jenis garis yang ditampilkan; kosong = semua. */
  kinds?: ReadonlySet<MapEdgeKind>;
}

export const NO_FILTER: MapFilter = { hide: new Set(), labelSource: 'all' };

export function isFilterActive(filter: MapFilter): boolean {
  return filter.hide.size > 0 || filter.labelSource !== 'all' || filter.from !== undefined || filter.to !== undefined || (filter.kinds?.size ?? 0) > 0;
}

export function primaryLabelKey(labels: readonly FlowLabelView[]): string {
  return labels[0]?.type ?? 'none';
}

/** Garis yang lolos filter waktu dan jenis. */
export function edgeMatches(edge: { kind: MapEdgeKind; timestamp: Date }, filter: MapFilter): boolean {
  if (filter.kinds && filter.kinds.size > 0 && !filter.kinds.has(edge.kind)) return false;
  if (filter.from && edge.timestamp < filter.from) return false;
  if (filter.to && edge.timestamp > filter.to) return false;
  return true;
}

export function nodeMatches(labels: readonly FlowLabelView[], filter: MapFilter): boolean {
  if (filter.hide.has(primaryLabelKey(labels))) return false;
  return filter.labelSource === 'all' || labels[0]?.source === filter.labelSource;
}

/** Jumlah wallet per jenis label utama, terbanyak dulu; `none` paling akhir. */
export function labelCounts(nodes: ReadonlyArray<{ labels: readonly FlowLabelView[] }>): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(primaryLabelKey(node.labels), (counts.get(primaryLabelKey(node.labels)) ?? 0) + 1);
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => Number(a.type === 'none') - Number(b.type === 'none') || b.count - a.count || a.type.localeCompare(b.type));
}
