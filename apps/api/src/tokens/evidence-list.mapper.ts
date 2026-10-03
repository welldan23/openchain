import type { riskFindings } from '../database/schema/index.js';
import type { EvidenceFilter, EvidenceItemView, EvidenceListResponse, RiskSeverity } from './evidence-list.types.js';
import { type EvidenceRecord, toEvidenceView } from './evidence.view.js';
import type { ContractCheckRow } from './rows.js';
import type { ResolvedToken } from './token-lookup.service.js';
import { toSnapshotHeader } from './token-summary.mapper.js';

type FindingRow = typeof riskFindings.$inferSelect;

export const SEVERITY_ORDER: RiskSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** Temuan paling parah dulu; untuk tingkat yang sama, urutan simpan dipertahankan. */
export function sortFindings<T extends Pick<FindingRow, 'severity' | 'id'>>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.id - b.id,
  );
}

/** Bukti terbaru dulu; bukti tanpa nomor blok di akhir. */
export function sortEvidenceNewestFirst(records: EvidenceRecord[]): EvidenceRecord[] {
  return [...records].sort((a, b) => {
    const blockA = a.evidence.blockNumber ?? -1;
    const blockB = b.evidence.blockNumber ?? -1;
    return blockB - blockA || a.evidence.id - b.evidence.id;
  });
}

export interface EvidenceListRows extends ResolvedToken {
  findings: FindingRow[];
  checks: ContractCheckRow[];
  findingLinks: Array<{ findingId: number; evidenceId: number }>;
  checkLinks: Array<{ checkId: number; evidenceId: number }>;
  records: Map<number, EvidenceRecord>;
}

export function toEvidenceListResponse(
  rows: EvidenceListRows,
  filter: EvidenceFilter,
  now: Date,
  staleAfterMinutes: number,
): EvidenceListResponse {
  const { chain, snapshot } = rows;
  const header = snapshot ? toSnapshotHeader(snapshot, now, staleAfterMinutes) : null;
  const findings = sortFindings(rows.findings);
  const findingRank = new Map(findings.map((finding, index) => [finding.id, index]));
  const findingCode = new Map(findings.map((finding) => [finding.id, finding.code]));
  const checkCode = new Map(rows.checks.map((check) => [check.id, check.code]));

  // Hubungan bukti → temuan dan bukti → pemeriksaan.
  const findingsByEvidence = new Map<number, number[]>();
  for (const link of rows.findingLinks) {
    const list = findingsByEvidence.get(link.evidenceId) ?? [];
    list.push(link.findingId);
    findingsByEvidence.set(link.evidenceId, list);
  }
  const checksByEvidence = new Map<number, number[]>();
  for (const link of rows.checkLinks) {
    const list = checksByEvidence.get(link.evidenceId) ?? [];
    list.push(link.checkId);
    checksByEvidence.set(link.evidenceId, list);
  }

  const filtered = sortEvidenceNewestFirst([...rows.records.values()]).filter((record) => {
    const id = record.evidence.id;
    if (filter.classification && record.evidence.classification !== filter.classification) return false;
    if (filter.finding) {
      const codes = (findingsByEvidence.get(id) ?? []).map((findingId) => findingCode.get(findingId));
      if (!codes.includes(filter.finding)) return false;
    }
    return true;
  });

  const evidence: EvidenceItemView[] = filtered.map((record) => {
    const id = record.evidence.id;
    const relatedFindings = [...new Set(findingsByEvidence.get(id) ?? [])]
      .sort((a, b) => (findingRank.get(a) ?? 0) - (findingRank.get(b) ?? 0))
      .map((findingId) => findingCode.get(findingId))
      .filter((code): code is string => code !== undefined);
    const relatedChecks = [...new Set(checksByEvidence.get(id) ?? [])]
      .sort((a, b) => a - b)
      .map((checkId) => checkCode.get(checkId))
      .filter((code): code is string => code !== undefined);
    return { ...toEvidenceView(record, chain), relatedFindings, relatedChecks };
  });

  return {
    chain: { id: chain.id, name: chain.name, supportStatus: chain.supportStatus },
    token: { address: rows.address },
    snapshot: header,
    dataStatus: header?.dataStatus ?? 'unavailable',
    filter,
    findings: findings.map((finding) => ({
      code: finding.code,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      classification: finding.classification,
      evidenceCount: new Set(
        rows.findingLinks.filter((link) => link.findingId === finding.id).map((link) => link.evidenceId),
      ).size,
    })),
    evidence,
  };
}
