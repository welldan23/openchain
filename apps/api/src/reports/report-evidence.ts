/**
 * Bukti transaksi laporan, murni: semua hash dari klaim dan bukti tersemat,
 * klaim yang mengutipnya, status semat, tangkapan data yang dipakai laporan,
 * dan tautan explorer. Hash tanpa rincian tersimpan tetap tampil apa adanya.
 */
import type { ChainFamily } from '../database/schema/enums.js';
import { explorerAddressUrl } from '../tokens/evidence.view.js';
import type { ReportEvidenceEntry, ReportEvidenceFilter, ReportView } from './reports.types.js';

export const EVIDENCE_SECTION = 'Bukti utama';
export const EVIDENCE_FILTERS: readonly ReportEvidenceFilter[] = ['all', 'not_embedded', 'no_detail'];

export type ExplorerChain = { id: string; family: ChainFamily; explorerUrl: string | null };

export function reportEvidenceEntries(report: Pick<ReportView, 'sections' | 'evidence' | 'snapshot'>, chains: ReadonlyMap<string, ExplorerChain>): ReportEvidenceEntry[] {
  const details = new Map(report.evidence.map((item) => [`${item.chain}:${item.txHash}`, item]));
  const byKey = new Map<string, ReportEvidenceEntry>();
  const entry = (chain: string, txHash: string): ReportEvidenceEntry => {
    const key = `${chain}:${txHash}`;
    let found = byKey.get(key);
    if (!found) {
      const detail = details.get(key);
      const explorer = chains.get(chain);
      const link = (address: string) => (explorer ? explorerAddressUrl(explorer, address) : null);
      found = {
        chain,
        txHash,
        stored: detail?.stored ?? false,
        explorerUrl: detail?.explorerUrl ?? (explorer?.explorerUrl ? `${explorer.explorerUrl.replace(/\/+$/, '')}/tx/${txHash}` : null),
        detail:
          detail?.stored && detail.timestamp !== null && detail.blockNumber !== null
            ? {
                timestamp: detail.timestamp,
                blockNumber: detail.blockNumber,
                movements: detail.movements.map((move) => ({ ...move, fromUrl: link(move.from), toUrl: link(move.to) })),
              }
            : null,
        citedBy: [],
        embeddedBlockId: null,
        capture: {
          fetchedAt: report.snapshot.fetchedAt,
          blockNumber: report.snapshot.blocks.find((block) => block.chain === chain)?.blockNumber ?? null,
          sources: report.snapshot.sources,
        },
      };
      byKey.set(key, found);
    }
    return found;
  };
  for (const block of report.sections.flatMap((section) => section.blocks)) {
    if (block.kind === 'claim') {
      for (const ref of block.claim.evidence) {
        const found = entry(ref.chain, ref.txHash);
        if (!found.citedBy.some((item) => item.blockId === block.id)) found.citedBy.push({ blockId: block.id, title: block.claim.title });
      }
    }
    if (block.kind === 'evidence') entry(block.chain, block.txHash).embeddedBlockId ??= block.id;
  }
  const entries = [...byKey.values()];
  const position = new Map(entries.map((item, index) => [item, index]));
  return entries.sort((a, b) => {
    if (a.detail && b.detail) return Date.parse(a.detail.timestamp) - Date.parse(b.detail.timestamp) || position.get(a)! - position.get(b)!;
    return Number(a.detail === null) - Number(b.detail === null) || position.get(a)! - position.get(b)!;
  });
}

export function filterEvidenceEntries(entries: ReportEvidenceEntry[], filter: ReportEvidenceFilter): ReportEvidenceEntry[] {
  if (filter === 'not_embedded') return entries.filter((item) => item.embeddedBlockId === null);
  if (filter === 'no_detail') return entries.filter((item) => item.detail === null);
  return entries;
}

/** Keterangan bawaan bukti tersemat: klaim yang mengutipnya, atau keterangan umum. */
export function embedCaption(entry: Pick<ReportEvidenceEntry, 'citedBy'> | undefined): string {
  const caption = entry && entry.citedBy.length > 0 ? `Bukti untuk: ${entry.citedBy.map((item) => item.title).join('; ')}.` : 'Bukti transaksi.';
  return caption.length <= 500 ? caption : `${caption.slice(0, 499).trimEnd()}…`;
}
