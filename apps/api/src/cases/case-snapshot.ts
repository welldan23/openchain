/**
 * Snapshot data kasus: blok tiap chain, provider, dan kelengkapan data yang
 * dipakai subjek-subjeknya saat item ditambahkan. Disimpan supaya hasil kasus
 * bisa direproduksi. Subjek tanpa data tersimpan tidak dianggap lengkap.
 */
import type { DataStatus } from '../database/schema/enums.js';

/** Data tersimpan terbaru untuk satu subjek di satu chain. */
export interface SubjectSource {
  chainId: string;
  blockNumber: number;
  fetchedAt: Date;
  status: DataStatus;
  providers: string[];
}

export interface SubjectSnapshotInput {
  title: string;
  /** Kosong bila subjek belum pernah diambil datanya. */
  sources: SubjectSource[];
}

export interface CaseSnapshot {
  snapshotAt: Date;
  blocks: Array<{ chainId: string; blockNumber: number }>;
  sources: string[];
  dataStatus: DataStatus;
  statusReason: string | null;
}

function list(titles: string[]): string {
  return titles.length <= 3 ? titles.join(', ') : `${titles.slice(0, 3).join(', ')}, dan ${titles.length - 3} lainnya`;
}

export function caseSnapshot(subjects: readonly SubjectSnapshotInput[], now: Date, chainRank: (chainId: string) => number): CaseSnapshot {
  const sources = subjects.flatMap((subject) => subject.sources);
  const blockByChain = new Map<string, number>();
  for (const source of sources) blockByChain.set(source.chainId, Math.max(blockByChain.get(source.chainId) ?? 0, source.blockNumber));
  const blocks = [...blockByChain]
    .map(([chainId, blockNumber]) => ({ chainId, blockNumber }))
    .sort((a, b) => chainRank(a.chainId) - chainRank(b.chainId) || a.chainId.localeCompare(b.chainId));
  const snapshotAt = sources.length === 0 ? now : new Date(Math.max(...sources.map((source) => source.fetchedAt.getTime())));
  const base = { snapshotAt, blocks, sources: [...new Set(sources.flatMap((source) => source.providers))].sort() };

  if (subjects.length === 0) {
    return { ...base, dataStatus: 'unavailable', statusReason: 'Kasus belum punya subjek, jadi belum ada data on-chain yang dibekukan.' };
  }
  const missing = subjects.filter((subject) => subject.sources.length === 0).map((subject) => subject.title);
  if (missing.length === subjects.length) {
    return { ...base, dataStatus: 'unavailable', statusReason: `Belum ada data tersimpan untuk ${list(missing)}. Buka halamannya dulu supaya datanya diambil.` };
  }
  const incomplete = subjects
    .filter((subject) => subject.sources.some((source) => source.status !== 'complete'))
    .map((subject) => subject.title);
  if (missing.length === 0 && incomplete.length === 0) return { ...base, dataStatus: 'complete', statusReason: null };
  const reasons = [
    ...(missing.length > 0 ? [`belum ada data tersimpan untuk ${list(missing)}`] : []),
    ...(incomplete.length > 0 ? [`data ${list(incomplete)} tidak lengkap`] : []),
  ];
  const reason = reasons.join('; ');
  return { ...base, dataStatus: 'partial', statusReason: `${reason[0].toUpperCase()}${reason.slice(1)}.` };
}
