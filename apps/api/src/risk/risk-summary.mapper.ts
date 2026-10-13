/** Bentuk ringkasan penilaian risiko dari baris tersimpan. */
import type { DangerTraitStatus, InfoClassification, RiskObjectKind, RiskSeverity } from '../database/schema/enums.js';
import { riskAssessments, riskReasons, riskTraitChecks, riskWarnings } from '../database/schema/index.js';
import type { FlowLabelView } from '../flows/flow-summary.types.js';
import type { RiskSummaryView } from './risk.types.js';

type AssessmentRow = typeof riskAssessments.$inferSelect;
type ReasonRow = typeof riskReasons.$inferSelect;
type WarningRow = typeof riskWarnings.$inferSelect;
type TraitRow = typeof riskTraitChecks.$inferSelect;

/** Urutan jenis informasi dari bukti terkuat. */
const CLASSIFICATION_ORDER: InfoClassification[] = ['verified_fact', 'derived_metric', 'external_label', 'heuristic', 'assumption'];
const SEVERITIES: RiskSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function scoreBreakdown(score: number | null, reasons: Pick<ReasonRow, 'classification' | 'points'>[]): RiskSummaryView['breakdown'] {
  const parts = CLASSIFICATION_ORDER.map((classification) => {
    const counted = reasons.filter((reason) => reason.classification === classification && reason.points !== null);
    return { classification, points: counted.reduce((total, reason) => total + (reason.points ?? 0), 0), reasonCount: counted.length };
  }).filter((part) => part.reasonCount > 0);
  const countedPoints = parts.reduce((total, part) => total + part.points, 0);
  // Skor dibatasi 100, jadi poin yang melebihi tidak dihitung sebagai "tidak dijelaskan".
  return {
    parts,
    countedPoints,
    uncounted: reasons.filter((reason) => reason.points === null).length,
    unexplained: score === null ? null : Math.max(0, score - Math.min(100, countedPoints)),
  };
}

function short(value: string): string {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function riskTitle(kind: RiskObjectKind, address: string, token: { name: string | null; symbol: string | null } | null, label: FlowLabelView | null): string {
  if (kind === 'token' && token && (token.name || token.symbol)) {
    return token.name && token.symbol ? `${token.name} (${token.symbol})` : (token.name ?? token.symbol)!;
  }
  return label?.name ?? short(address);
}

export function riskLinks(kind: RiskObjectKind, chain: string, address: string, family: string, hasMap: boolean): RiskSummaryView['links'] {
  if (kind === 'token') {
    return [{ kind: 'token', href: `/token/${chain}/${address}` }, ...(hasMap ? [{ kind: 'map' as const, href: `/map/${chain}/${address}` }] : [])];
  }
  return [{ kind: 'flow', href: `/flow/${chain}/${address}` }, ...(family === 'evm' ? [{ kind: 'multichain' as const, href: `/multichain/${address}` }] : [])];
}

export function toSummaryView(input: {
  address: string;
  title: string;
  label: FlowLabelView | null;
  assessment: AssessmentRow;
  reasons: ReasonRow[];
  warnings: WarningRow[];
  traits: TraitRow[];
  sources: string[];
  newerDataAvailable: boolean;
  links: RiskSummaryView['links'];
}): RiskSummaryView {
  const { assessment, reasons, warnings, traits } = input;
  const warningsBySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, warnings.filter((item) => item.severity === severity).length])) as Record<RiskSeverity, number>;
  const traitCounts: Record<DangerTraitStatus, number> = { detected: 0, unknown: 0, clear: 0 };
  for (const item of traits) traitCounts[item.status] += 1;
  const [latest] = [...warnings].sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  return {
    status: 'assessed',
    chain: assessment.chainId,
    address: input.address,
    objectKind: assessment.objectKind,
    title: input.title,
    label: input.label,
    assessmentId: String(assessment.id),
    methodology: assessment.methodology,
    score: assessment.score,
    level: assessment.level,
    breakdown: scoreBreakdown(assessment.score, reasons),
    counts: { reasons: reasons.length, warnings: warnings.length, warningsBySeverity, traits: traitCounts },
    topReasons: reasons.slice(0, 3).map((reason) => ({
      code: reason.code,
      title: reason.title,
      severity: reason.severity,
      classification: reason.classification,
      points: reason.points,
    })),
    latestWarning: latest ? { title: latest.title, severity: latest.severity, detectedAt: latest.detectedAt.toISOString() } : null,
    snapshot: {
      blockNumber: assessment.blockNumber,
      fetchedAt: assessment.fetchedAt.toISOString(),
      assessedAt: assessment.assessedAt.toISOString(),
      sources: input.sources,
      dataStatus: assessment.dataStatus,
      statusReason: assessment.statusReason,
    },
    newerDataAvailable: input.newerDataAvailable,
    links: input.links,
  };
}
