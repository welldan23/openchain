/**
 * Aturan klasifikasi temuan dan tingkat risiko.
 *
 * Kekuatan informasi, dari terkuat ke terlemah:
 * verified_fact > derived_metric > external_label > heuristic > assumption > unavailable.
 * Sebuah temuan hanya sekuat bukti terlemahnya, supaya kesimpulan tidak
 * terdengar lebih pasti daripada datanya.
 */
import type { InfoClassification } from '../database/schema/enums.js';

export const CLASSIFICATION_STRENGTH: InfoClassification[] = [
  'verified_fact',
  'derived_metric',
  'external_label',
  'heuristic',
  'assumption',
  'unavailable',
];

/** Klasifikasi terlemah dari sekumpulan bukti. */
export function weakestClassification(classifications: InfoClassification[]): InfoClassification {
  if (classifications.length === 0) {
    throw new Error('Minimal satu klasifikasi dibutuhkan.');
  }
  return classifications.reduce((weakest, current) =>
    CLASSIFICATION_STRENGTH.indexOf(current) > CLASSIFICATION_STRENGTH.indexOf(weakest) ? current : weakest,
  );
}

/**
 * Klasifikasi temuan dari bukti pendukungnya. Temuan tanpa bukti diperlakukan
 * sebagai asumsi.
 */
export function classifyFinding(evidenceClassifications: InfoClassification[]): InfoClassification {
  return evidenceClassifications.length === 0 ? 'assumption' : weakestClassification(evidenceClassifications);
}

export type RiskLevel = 'unknown' | 'low' | 'medium' | 'high' | 'critical';

/** Tingkat risiko dari skor 0–100; tanpa skor berarti belum dinilai. */
export function riskLevelFromScore(score: number | null): RiskLevel {
  if (score === null) return 'unknown';
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error(`Skor risiko harus bilangan bulat 0–100: ${score}`);
  }
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}
