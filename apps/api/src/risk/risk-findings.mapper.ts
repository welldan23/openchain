/** Saringan dan facet temuan risiko (murni). */
import type { InfoClassification, RiskSeverity } from '../database/schema/enums.js';
import type { RiskFindingsResponse, RiskFindingView } from './risk.types.js';

export const SEVERITY_ORDER: RiskSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const CLASSIFICATION_ORDER: InfoClassification[] = ['verified_fact', 'derived_metric', 'external_label', 'heuristic', 'assumption', 'unavailable'];

/** Terberat dulu; di tingkat sama alasan dulu, lalu poin terbesar, lalu peringatan terbaru. */
export function sortFindings(findings: RiskFindingView[]): RiskFindingView[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      Number(a.kind === 'warning') - Number(b.kind === 'warning') ||
      (b.points ?? -1) - (a.points ?? -1) ||
      (b.detectedAt ?? '').localeCompare(a.detectedAt ?? '') ||
      a.id.localeCompare(b.id),
  );
}

export function filterFindings(findings: RiskFindingView[], filters: RiskFindingsResponse['filters'], skip?: 'classification' | 'severity'): RiskFindingView[] {
  return findings.filter(
    (finding) =>
      (skip === 'classification' || filters.classification.length === 0 || filters.classification.includes(finding.classification)) &&
      (skip === 'severity' || filters.severity.length === 0 || filters.severity.includes(finding.severity)),
  );
}

/** Pilihan diambil dari semua temuan supaya pilihan aktif tidak hilang; jumlahnya mengikuti saringan lain. */
export function findingFacets(findings: RiskFindingView[], filters: RiskFindingsResponse['filters']): RiskFindingsResponse['facets'] {
  const byClassification = filterFindings(findings, filters, 'classification');
  const bySeverity = filterFindings(findings, filters, 'severity');
  const classifications = CLASSIFICATION_ORDER.filter((item) => findings.some((finding) => finding.classification === item));
  const severities = SEVERITY_ORDER.filter((item) => findings.some((finding) => finding.severity === item));
  return {
    classification: classifications.map((classification) => ({
      classification,
      name: findings.find((finding) => finding.classification === classification)!.classificationInfo.name,
      count: byClassification.filter((finding) => finding.classification === classification).length,
    })),
    severity: severities.map((severity) => ({ severity, count: bySeverity.filter((finding) => finding.severity === severity).length })),
  };
}
