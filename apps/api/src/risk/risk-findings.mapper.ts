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

/** Total poin yang dihitung dan porsi satu temuan darinya (persen, satu desimal). */
export function pointsShare(finding: Pick<RiskFindingView, 'points'>, all: RiskFindingView[]): { countedPoints: number; share: number | null } {
  const countedPoints = all.reduce((sum, item) => sum + (item.kind === 'reason' ? (item.points ?? 0) : 0), 0);
  if (finding.points === null || countedPoints === 0) return { countedPoints, share: null };
  return { countedPoints, share: Math.round((finding.points / countedPoints) * 1000) / 10 };
}

/** Posisi temuan dalam urutan daftar, beserta tetangganya. */
export function findingNavigation(all: RiskFindingView[], kind: RiskFindingView['kind'], id: string) {
  const sorted = sortFindings(all);
  const index = sorted.findIndex((item) => item.kind === kind && item.id === id);
  const ref = (item: RiskFindingView | undefined) => (item ? { kind: item.kind, id: item.id } : null);
  return { previous: ref(sorted[index - 1]), next: ref(sorted[index + 1]), position: index + 1, total: sorted.length };
}

/** Catatan kejujuran untuk satu temuan: jenis informasinya, bukti yang belum tersimpan, atau tidak adanya hash. */
export function findingCaveats(
  finding: Pick<RiskFindingView, 'kind' | 'classification' | 'points'>,
  evidence: Array<{ stored: boolean }>,
  sources: string[],
  countedPoints: number,
): string[] {
  const caveats: string[] = [];
  if (finding.classification === 'heuristic') caveats.push('Temuan ini dugaan dari pola (heuristic) dan bisa keliru; cek hash buktinya sebelum menyimpulkan.');
  if (finding.classification === 'external_label') caveats.push('Temuan ini berasal dari label pihak ketiga; label bisa keliru atau usang.');
  if (finding.classification === 'assumption') caveats.push('Temuan ini asumsi dan tidak ikut dihitung ke skor.');
  if (finding.kind === 'warning') caveats.push('Peringatan dini tidak menambah skor; ini pola baru yang perlu dipantau.');
  if (finding.kind === 'reason' && finding.points !== null && countedPoints > 100) {
    caveats.push('Skor dibatasi 100, jadi jumlah poin bisa melebihi skor yang tampil.');
  }
  const missing = evidence.filter((item) => !item.stored).length;
  if (missing > 0) caveats.push(`${missing} hash bukti belum tersimpan isinya; buka di explorer untuk melihatnya.`);
  if (evidence.length === 0) {
    caveats.push(
      `Temuan ini tidak punya hash transaksi karena berasal dari pemeriksaan keadaan kontrak, hitungan, atau label${sources.length > 0 ? `; sumber data penilaian: ${sources.join(', ')}` : ''}.`,
    );
  }
  return caveats;
}
