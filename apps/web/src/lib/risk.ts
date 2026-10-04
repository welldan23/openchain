/**
 * Aturan tampilan halaman risiko objek: urutan alasan dan peringatan, rincian
 * skor per jenis informasi, dan ringkasan sumber label. Skor yang tidak
 * didukung poin alasan tidak disamarkan; selisihnya ditampilkan apa adanya.
 */
import { CLASSIFICATION_ORDER, DANGER_CATEGORY_META, DANGER_TRAIT_META } from "./labels";
import type {
  DangerCategory,
  DangerTraitCheck,
  DangerTraitStatus,
  FindingClassification,
  ObjectRisk,
  RiskLabel,
  RiskLevel,
  RiskReason,
  RiskSeverity,
  RiskWarning,
  TxEvidence,
} from "./types";

export const SEVERITY_ORDER: RiskSeverity[] = ["critical", "high", "medium", "low", "info"];

const severityRank = (severity: RiskSeverity) => SEVERITY_ORDER.indexOf(severity);

/** Alasan terberat dulu; di tingkat yang sama, sumbangan poin terbesar dulu. */
export function sortReasons(reasons: RiskReason[]): RiskReason[] {
  return [...reasons].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || (b.points ?? -1) - (a.points ?? -1),
  );
}

/** Peringatan terbaru dulu; di waktu yang sama, yang terberat dulu. */
export function sortWarnings(warnings: RiskWarning[]): RiskWarning[] {
  return [...warnings].sort(
    (a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt) || severityRank(a.severity) - severityRank(b.severity),
  );
}

export interface ScoreBreakdown {
  /** Poin per jenis informasi, urut baku, hanya yang punya poin. */
  parts: Array<{ classification: FindingClassification; points: number; reasonCount: number }>;
  countedPoints: number;
  /** Alasan yang tidak ikut dihitung ke skor (poin kosong). */
  uncounted: number;
  /** Skor dikurangi jumlah poin; bukan nol berarti sebagian skor belum dijelaskan alasan. */
  unexplained: number | null;
}

export function scoreBreakdown(risk: Pick<ObjectRisk, "score" | "reasons">): ScoreBreakdown {
  const parts = CLASSIFICATION_ORDER.map((classification) => {
    const counted = risk.reasons.filter((reason) => reason.classification === classification && reason.points !== null);
    return {
      classification,
      points: counted.reduce((total, reason) => total + (reason.points ?? 0), 0),
      reasonCount: counted.length,
    };
  }).filter((part) => part.reasonCount > 0);
  const countedPoints = parts.reduce((total, part) => total + part.points, 0);
  return {
    parts,
    countedPoints,
    uncounted: risk.reasons.filter((reason) => reason.points === null).length,
    unexplained: risk.score === null ? null : risk.score - countedPoints,
  };
}

export interface LabelSourceSummary {
  external: number;
  heuristic: number;
  /** Nama sumber unik, eksternal dulu. */
  sourceNames: string[];
}

export function labelSourceSummary(labels: RiskLabel[]): LabelSourceSummary {
  const ordered = [...labels].sort((a, b) => Number(a.source === "heuristic") - Number(b.source === "heuristic"));
  return {
    external: labels.filter((label) => label.source === "external").length,
    heuristic: labels.filter((label) => label.source === "heuristic").length,
    sourceNames: [...new Set(ordered.map((label) => label.sourceName))],
  };
}

/** Label eksternal dulu, lalu heuristic dengan keyakinan tertinggi. */
export function sortLabels(labels: RiskLabel[]): RiskLabel[] {
  return [...labels].sort(
    (a, b) => Number(a.source === "heuristic") - Number(b.source === "heuristic") || (b.confidence ?? 1) - (a.confidence ?? 1),
  );
}

/** Peringatan dengan tingkat tinggi atau kritis, untuk penanda di kepala halaman. */
export function urgentWarnings(warnings: RiskWarning[]): RiskWarning[] {
  return warnings.filter((warning) => severityRank(warning.severity) <= severityRank("high"));
}

export type RatedRiskLevel = Exclude<RiskLevel, "unknown">;

/** Rentang skor tiap tingkat risiko; sama dengan batas di backend (`riskLevelFromScore`). */
export const RISK_BANDS: Array<{ level: RatedRiskLevel; label: string; min: number; max: number }> = [
  { level: "low", label: "Rendah", min: 0, max: 24 },
  { level: "medium", label: "Sedang", min: 25, max: 49 },
  { level: "high", label: "Tinggi", min: 50, max: 74 },
  { level: "critical", label: "Kritis", min: 75, max: 100 },
];

/** Tingkat risiko dari skor 0–100; tanpa skor berarti belum dinilai, bukan rendah. */
export function riskLevelForScore(score: number | null): RiskLevel {
  if (score === null || !Number.isFinite(score)) return "unknown";
  const clamped = scorePosition(score);
  return RISK_BANDS.findLast((band) => clamped >= band.min)!.level;
}

/** Posisi skor di skala, dalam persen lebar; dibatasi 0–100. */
export function scorePosition(score: number): number {
  return Math.min(100, Math.max(0, score));
}

/** Peringatan dianggap baru bila terdeteksi dalam rentang ini sebelum waktu acuan (mis. snapshot). */
export const NEW_WARNING_HOURS = 24;

export function isNewWarning(warning: Pick<RiskWarning, "detectedAt">, now: Date, hours = NEW_WARNING_HOURS): boolean {
  const age = now.getTime() - Date.parse(warning.detectedAt);
  return age <= hours * 3_600_000;
}

export interface WarningSummary {
  total: number;
  bySeverity: Record<RiskSeverity, number>;
  newCount: number;
}

export function warningSummary(warnings: RiskWarning[], now: Date): WarningSummary {
  const bySeverity = Object.fromEntries(SEVERITY_ORDER.map((severity) => [severity, 0])) as Record<RiskSeverity, number>;
  for (const warning of warnings) bySeverity[warning.severity] += 1;
  return { total: warnings.length, bySeverity, newCount: warnings.filter((warning) => isNewWarning(warning, now)).length };
}

/** Terdeteksi dulu, lalu yang belum bisa dicek, lalu yang tidak terdeteksi. */
export const TRAIT_STATUS_ORDER: DangerTraitStatus[] = ["detected", "unknown", "clear"];

/** Ciri yang dipantau per kategori (urut baku); kategori tanpa ciri tidak ditampilkan. */
export function groupTraitChecks(checks: DangerTraitCheck[]): Array<{ category: DangerCategory; checks: DangerTraitCheck[] }> {
  return (Object.keys(DANGER_CATEGORY_META) as DangerCategory[])
    .map((category) => ({
      category,
      checks: checks
        .filter((check) => DANGER_TRAIT_META[check.trait].category === category)
        .sort((a, b) => TRAIT_STATUS_ORDER.indexOf(a.status) - TRAIT_STATUS_ORDER.indexOf(b.status)),
    }))
    .filter((group) => group.checks.length > 0);
}

export function traitCheckCounts(checks: DangerTraitCheck[]): Record<DangerTraitStatus, number> {
  const counts: Record<DangerTraitStatus, number> = { detected: 0, unknown: 0, clear: 0 };
  for (const check of checks) counts[check.status] += 1;
  return counts;
}

const REASON_DRAWER_PREFIX = "detail-alasan-";

/** Fragmen URL yang membuka laci alasan, mis. `#detail-alasan-nbla-owner-tax`. */
export function reasonDrawerAnchor(reasonId: string): string {
  return `${REASON_DRAWER_PREFIX}${reasonId}`;
}

/** Id alasan dari fragmen URL (dengan atau tanpa `#`); `null` bila bukan tautan laci alasan. */
export function parseReasonDrawerAnchor(fragment: string): string | null {
  const value = decodeURIComponent(fragment.replace(/^#/, ""));
  return value.startsWith(REASON_DRAWER_PREFIX) && value.length > REASON_DRAWER_PREFIX.length
    ? value.slice(REASON_DRAWER_PREFIX.length)
    : null;
}

export interface ReasonDetail {
  reason: RiskReason;
  /** Porsi poin alasan ini dari skor, dalam persen; `null` bila tidak dihitung atau skor kosong. */
  scoreSharePct: number | null;
  traits: DangerTraitCheck[];
  /** Bukti urut waktu (lama ke baru); hash tanpa detail tersimpan di akhir, urutan asli. */
  evidence: Array<{ txHash: string; detail: TxEvidence | null }>;
  /** Alasan sebelum dan sesudahnya di urutan tampil, untuk navigasi di laci. */
  previousId: string | null;
  nextId: string | null;
}

export function reasonDetail(risk: Pick<ObjectRisk, "score" | "reasons" | "traitChecks" | "evidence">, reasonId: string): ReasonDetail | null {
  const ordered = sortReasons(risk.reasons);
  const index = ordered.findIndex((item) => item.id === reasonId);
  if (index === -1) return null;
  const reason = ordered[index];
  const byHash = new Map(risk.evidence.map((item) => [item.txHash.toLowerCase(), item]));
  const evidence = [...new Set(reason.evidenceTxHashes)]
    .map((txHash, position) => ({ txHash, detail: byHash.get(txHash.toLowerCase()) ?? null, position }))
    .sort((a, b) => {
      if (a.detail && b.detail) return Date.parse(a.detail.timestamp) - Date.parse(b.detail.timestamp) || a.position - b.position;
      return Number(a.detail === null) - Number(b.detail === null) || a.position - b.position;
    })
    .map(({ txHash, detail }) => ({ txHash, detail }));
  return {
    reason,
    scoreSharePct: reason.points === null || !risk.score ? null : Math.round((reason.points / risk.score) * 100),
    traits: risk.traitChecks.filter((check) => check.reasonId === reason.id),
    evidence,
    previousId: ordered[index - 1]?.id ?? null,
    nextId: ordered[index + 1]?.id ?? null,
  };
}
