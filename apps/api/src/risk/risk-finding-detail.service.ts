/**
 * Rincian satu alasan penilaian atau peringatan dini: poin dan porsinya,
 * jenis informasi, ciri terkait, dan semua hash buktinya beserta isi
 * transaksinya (perpindahan dana dengan label pihak) dari data tersimpan.
 * Hash yang belum tersimpan dilaporkan `stored: false`, isinya tidak dikarang.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { FlowsRepository } from '../flows/flows.repository.js';
import { TransactionEvidenceService } from '../flows/transaction-evidence.service.js';
import { explorerEvidenceUrl, toEvidenceView } from '../tokens/evidence.view.js';
import { findingCaveats, findingNavigation, pointsShare } from './risk-findings.mapper.js';
import { RiskFindingsService } from './risk-findings.service.js';
import { RiskRepository } from './risk.repository.js';
import type { RiskEvidenceDetail, RiskFindingDetailResponse } from './risk.types.js';

@Injectable()
export class RiskFindingDetailService {
  constructor(
    private readonly findings: RiskFindingsService,
    private readonly repository: RiskRepository,
    private readonly flows: FlowsRepository,
    private readonly transactions: TransactionEvidenceService,
  ) {}

  async detail(chainId: string, rawAddress: string, kind: 'reason' | 'warning', code: string, refresh = false): Promise<RiskFindingDetailResponse> {
    const { object, assessment, all, traits, sources, reasons, warnings } = await this.findings.collect(chainId, rawAddress, refresh);
    const found = all.find((item) => item.kind === kind && item.id === code);
    if (!found) {
      throw new NotFoundException(`${kind === 'reason' ? 'Alasan' : 'Peringatan'} "${code}" tidak ada di penilaian terbaru objek ini.`);
    }
    const links =
      kind === 'reason'
        ? await this.repository.reasonEvidence([reasons.find((item) => item.code === code)!.id])
        : await this.repository.warningEvidence([warnings.find((item) => item.code === code)!.id]);
    const evidence = await this.evidence(links);

    const { evidence: _summary, ...finding } = found;
    const { countedPoints, share } = pointsShare(found, all);
    return {
      chain: object.chainId,
      address: object.address,
      objectKind: assessment.objectKind,
      assessmentId: String(assessment.id),
      methodology: assessment.methodology,
      score: assessment.score,
      level: assessment.level,
      finding,
      shareOfCountedPoints: kind === 'reason' ? share : null,
      countedPoints,
      traits: traits.filter((item) => item.finding?.kind === kind && item.finding.id === code),
      evidence,
      sources,
      navigation: findingNavigation(all, kind, code),
      caveats: findingCaveats(found, evidence, sources, countedPoints),
    };
  }

  private async evidence(links: Array<{ chainId: string; txHash: string; evidenceId: number | null }>): Promise<RiskEvidenceDetail[]> {
    if (links.length === 0) return [];
    const records = await this.repository.evidenceRecords(links.flatMap((item) => (item.evidenceId === null ? [] : [item.evidenceId])));
    const chainIds = [...new Set(links.map((item) => item.chainId))];
    const chains = new Map((await Promise.all(chainIds.map((id) => this.flows.findChain(id)))).flatMap((chain) => (chain ? [[chain.id, chain] as const] : [])));
    return Promise.all(
      links.map(async (link) => {
        const chain = chains.get(link.chainId)!;
        const record = link.evidenceId === null ? undefined : records.get(link.evidenceId);
        const tx = await this.transactions.getEvidence(link.chainId, link.txHash).catch((error: unknown) => {
          if (error instanceof NotFoundException) return null;
          throw error;
        });
        return {
          chain: link.chainId,
          txHash: link.txHash,
          stored: tx !== null,
          explorerUrl: explorerEvidenceUrl(chain, { txHash: link.txHash, blockNumber: null }),
          record: record ? toEvidenceView(record, chain) : null,
          transaction: tx ? { blockNumber: tx.blockNumber, timestamp: tx.timestamp, transaction: tx.transaction, movements: tx.movements, sources: tx.sources } : null,
        };
      }),
    );
  }
}
