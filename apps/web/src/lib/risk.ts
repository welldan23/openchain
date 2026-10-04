/**
 * Aturan tampilan halaman risiko objek: urutan alasan dan peringatan, rincian
 * skor per jenis informasi, dan ringkasan sumber label. Skor yang tidak
 * didukung poin alasan tidak disamarkan; selisihnya ditampilkan apa adanya.
 */
import { CLASSIFICATION_ORDER } from "./labels";
import type { FindingClassification, ObjectRisk, RiskLabel, RiskLevel, RiskReason, RiskSeverity, RiskWarning } from "./types";

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
