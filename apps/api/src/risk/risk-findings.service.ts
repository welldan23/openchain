/**
 * Temuan risiko satu objek: alasan penilaian (berpoin) dan peringatan dini,
 * masing-masing dengan jenis informasi, ciri berbahaya terkait, dan hash
 * buktinya (tersimpan atau belum). Dari penilaian tersimpan; objek yang
 * belum dinilai dinilai dulu dari data tersimpan.
 */
import { Injectable } from '@nestjs/common';
import type { InfoClassification, RiskSeverity } from '../database/schema/enums.js';
import { filterFindings, findingFacets, sortFindings } from './risk-findings.mapper.js';
import { RiskSummaryService } from './risk-summary.service.js';
import { RiskRepository } from './risk.repository.js';
import type { RiskFindingsResponse, RiskFindingView, RiskTraitView } from './risk.types.js';

@Injectable()
export class RiskFindingsService {
  constructor(
    private readonly summaries: RiskSummaryService,
    private readonly repository: RiskRepository,
  ) {}

  /** Semua temuan dan ciri penilaian terbaru objek, belum disaring. */
  async collect(chainId: string, rawAddress: string, refresh = false) {
    const { object, assessment } = await this.summaries.assessmentFor(chainId, rawAddress, refresh);
    const [{ reasons, warnings, traits, sources }, labels, explorers] = await Promise.all([
      this.repository.assessmentParts(assessment.id),
      this.repository.classificationLabels(),
      this.repository.explorerUrls(),
    ]);
    const [reasonEvidence, warningEvidence] = await Promise.all([
      this.repository.reasonEvidence(reasons.map((item) => item.id)),
      this.repository.warningEvidence(warnings.map((item) => item.id)),
    ]);
    const stored = await this.repository.storedTransactions([...reasonEvidence, ...warningEvidence].map((item) => ({ chainId: item.chainId, txHash: item.txHash })));
    const evidenceView = (item: { chainId: string; txHash: string }) => {
      const base = explorers.get(item.chainId)?.replace(/\/+$/, '');
      return { chain: item.chainId, txHash: item.txHash, stored: stored.has(`${item.chainId}:${item.txHash}`), explorerUrl: base ? `${base}/tx/${item.txHash}` : null };
    };
    const info = (classification: InfoClassification) => labels.get(classification) ?? { name: classification, description: '' };
    const traitOfReason = new Map(traits.flatMap((item) => (item.reasonId === null ? [] : [[item.reasonId, item.trait] as const])));

    const all: RiskFindingView[] = [
      ...reasons.map((reason) => ({
        id: reason.code,
        kind: 'reason' as const,
        title: reason.title,
        description: reason.description,
        severity: reason.severity,
        classification: reason.classification,
        classificationInfo: info(reason.classification),
        points: reason.points,
        trait: traitOfReason.get(reason.id) ?? null,
        detectedAt: null,
        evidence: reasonEvidence.filter((item) => item.reasonId === reason.id).map(evidenceView),
      })),
      ...warnings.map((warning) => ({
        id: warning.code,
        kind: 'warning' as const,
        title: warning.title,
        description: warning.description,
        severity: warning.severity,
        classification: warning.classification,
        classificationInfo: info(warning.classification),
        points: null,
        trait: warning.trait,
        detectedAt: warning.detectedAt.toISOString(),
        evidence: warningEvidence.filter((item) => item.warningId === warning.id).map(evidenceView),
      })),
    ];
    const reasonCode = new Map(reasons.map((reason) => [reason.id, reason.code]));
    const warningCode = new Map(warnings.map((warning) => [warning.id, warning.code]));
    const traitViews: RiskTraitView[] = traits
      .map((item) => ({
        trait: item.trait,
        status: item.status,
        note: item.note,
        finding:
          item.reasonId !== null
            ? { kind: 'reason' as const, id: reasonCode.get(item.reasonId)! }
            : item.warningId !== null
              ? { kind: 'warning' as const, id: warningCode.get(item.warningId)! }
              : null,
      }))
      .sort((a, b) => ['detected', 'unknown', 'clear'].indexOf(a.status) - ['detected', 'unknown', 'clear'].indexOf(b.status) || a.trait.localeCompare(b.trait));

    return { object, assessment, all, traits: traitViews, sources, reasons, warnings };
  }

  async findings(
    chainId: string,
    rawAddress: string,
    filters: { classification: InfoClassification[]; severity: RiskSeverity[] },
    refresh = false,
  ): Promise<RiskFindingsResponse> {
    const { object, assessment, all, traits: traitViews } = await this.collect(chainId, rawAddress, refresh);
    const filtered = sortFindings(filterFindings(all, filters));
    const caveats = ['Temuan dugaan (heuristic) dan label eksternal bisa keliru; cek hash buktinya sebelum menyimpulkan.'];
    if (all.some((item) => item.evidence.some((evidence) => !evidence.stored))) {
      caveats.push('Sebagian hash bukti belum tersimpan rinciannya; buka di explorer untuk melihat isinya.');
    }
    const withoutHash = all.filter((item) => item.evidence.length === 0).length;
    if (withoutHash > 0) {
      caveats.push(
        `${withoutHash} temuan tidak punya hash transaksi karena berasal dari pemeriksaan keadaan kontrak, hitungan, atau label; sumbernya tercatat di provider snapshot penilaian.`,
      );
    }
    if (traitViews.some((item) => item.status === 'unknown')) caveats.push('Ciri yang belum bisa dicek bukan berarti aman.');
    return {
      chain: object.chainId,
      address: object.address,
      objectKind: assessment.objectKind,
      assessmentId: String(assessment.id),
      methodology: assessment.methodology,
      score: assessment.score,
      level: assessment.level,
      filters,
      findings: filtered,
      total: filtered.length,
      facets: findingFacets(all, filters),
      traits: traitViews,
      caveats,
    };
  }
}
