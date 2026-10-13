/**
 * Bukti transaksi laporan dan penyematannya. `list` memberi semua hash dari
 * klaim dan bukti tersemat beserta rincian tersimpan, tautan explorer
 * (transaksi dan pihak-pihaknya), klaim pengutip, dan tangkapan datanya.
 * `embed` menyematkan satu hash sebagai blok bukti di bagian "Bukti utama";
 * hash yang sudah tersemat tidak digandakan.
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { InvalidIdentifierError, normalizeTxHash } from '../database/identifiers.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { EVIDENCE_SECTION, embedCaption, filterEvidenceEntries, reportEvidenceEntries } from './report-evidence.js';
import type { EmbedInput } from './report-input.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import type { ReportEmbedResult, ReportEvidenceFilter, ReportEvidenceResponse } from './reports.types.js';

@Injectable()
export class ReportEvidenceService {
  constructor(
    private readonly reports: ReportsService,
    private readonly repository: ReportsRepository,
    private readonly flows: FlowsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(id: number, filter: ReportEvidenceFilter): Promise<ReportEvidenceResponse> {
    const report = await this.reports.get(id);
    const chains = new Map((await this.flows.listChains()).map((chain) => [chain.id, chain]));
    const all = reportEvidenceEntries(report, chains);
    const entries = filterEvidenceEntries(all, filter);
    const caveats: string[] = [];
    const noDetail = all.filter((item) => item.detail === null).length;
    if (noDetail > 0) caveats.push(`${noDetail} hash belum punya rincian tersimpan; isinya tidak ditebak, buka tautan explorer-nya.`);
    const noExplorer = [...new Set(all.filter((item) => item.explorerUrl === null).map((item) => item.chain))];
    if (noExplorer.length > 0) caveats.push(`Chain ${noExplorer.join(', ')} belum punya explorer, jadi hash-nya tanpa tautan.`);
    return {
      reportId: report.id,
      filter,
      entries,
      total: entries.length,
      counts: { all: all.length, not_embedded: filterEvidenceEntries(all, 'not_embedded').length, no_detail: noDetail },
      caveats,
    };
  }

  async embed(id: number, input: EmbedInput): Promise<ReportEmbedResult> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException(`Laporan ${id} tidak ditemukan.`);
    if (row.status === 'final') throw new ConflictException('Laporan final dikunci. Ubah statusnya ke review atau draft dulu sebelum menyematkan bukti.');
    const chain = await this.flows.findChain(input.chain);
    if (!chain) throw new BadRequestException(`Chain "${input.chain}" tidak dikenal.`);
    let txHash: string;
    try {
      txHash = normalizeTxHash(chain.family, input.txHash);
    } catch (error) {
      if (error instanceof InvalidIdentifierError) throw new BadRequestException(error.message);
      throw error;
    }

    const report = await this.reports.get(id);
    const entry = reportEvidenceEntries(report, new Map([[chain.id, chain]])).find((item) => item.chain === chain.id && item.txHash === txHash);
    if (entry?.embeddedBlockId) return { report, blockId: entry.embeddedBlockId, created: false };
    const now = this.clock.now();
    const [blockId] = await this.repository.db.transaction(async (tx) => {
      const ids = await this.repository.appendBlocks(
        tx,
        id,
        EVIDENCE_SECTION,
        [{ kind: 'evidence', id: null, chain: chain.id, txHash, caption: input.caption ?? embedCaption(entry), sourceKey: null }],
        (titles) => titles.length,
        now,
      );
      await this.repository.updateReport(tx, id, { updatedAt: now });
      return ids;
    });
    return { report: await this.reports.get(id), blockId: String(blockId), created: true };
  }
}
