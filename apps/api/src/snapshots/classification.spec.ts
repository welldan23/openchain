import { classifyFinding, riskLevelFromScore, weakestClassification } from './classification.js';
import { deriveSnapshotStatus } from './snapshot-status.js';

describe('klasifikasi temuan', () => {
  it('memakai bukti terlemah sebagai klasifikasi temuan', () => {
    expect(classifyFinding(['verified_fact', 'verified_fact'])).toBe('verified_fact');
    expect(classifyFinding(['verified_fact', 'derived_metric'])).toBe('derived_metric');
    expect(classifyFinding(['verified_fact', 'verified_fact', 'heuristic'])).toBe('heuristic');
    expect(classifyFinding(['external_label', 'derived_metric'])).toBe('external_label');
    expect(classifyFinding(['heuristic', 'assumption'])).toBe('assumption');
    expect(classifyFinding(['verified_fact', 'unavailable'])).toBe('unavailable');
  });

  it('menganggap temuan tanpa bukti sebagai asumsi', () => {
    expect(classifyFinding([])).toBe('assumption');
  });

  it('menolak daftar kosong pada fungsi dasarnya', () => {
    expect(() => weakestClassification([])).toThrow();
  });
});

describe('tingkat risiko dari skor', () => {
  it('memetakan skor ke tingkat dengan batas yang jelas', () => {
    expect(riskLevelFromScore(null)).toBe('unknown');
    expect(riskLevelFromScore(0)).toBe('low');
    expect(riskLevelFromScore(24)).toBe('low');
    expect(riskLevelFromScore(25)).toBe('medium');
    expect(riskLevelFromScore(49)).toBe('medium');
    expect(riskLevelFromScore(50)).toBe('high');
    expect(riskLevelFromScore(68)).toBe('high');
    expect(riskLevelFromScore(75)).toBe('critical');
    expect(riskLevelFromScore(100)).toBe('critical');
  });

  it('menolak skor di luar 0–100 atau bukan bilangan bulat', () => {
    expect(() => riskLevelFromScore(101)).toThrow();
    expect(() => riskLevelFromScore(-1)).toThrow();
    expect(() => riskLevelFromScore(12.5)).toThrow();
  });
});

describe('status data snapshot', () => {
  it('menurunkan status dari provider', () => {
    expect(deriveSnapshotStatus([])).toBe('unavailable');
    expect(deriveSnapshotStatus(['complete', 'complete'])).toBe('complete');
    expect(deriveSnapshotStatus(['complete', 'partial'])).toBe('partial');
    expect(deriveSnapshotStatus(['complete', 'unavailable'])).toBe('partial');
    expect(deriveSnapshotStatus(['unavailable', 'unavailable'])).toBe('unavailable');
    expect(deriveSnapshotStatus(['complete', 'stale'])).toBe('stale');
    expect(deriveSnapshotStatus(['stale', 'partial'])).toBe('partial');
  });
});
