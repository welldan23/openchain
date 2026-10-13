import { blockersOf, reportIssues, reportStats } from './report-readiness.js';
import type { ReportClaimView, ReportSectionView } from './reports.types.js';

const claim = (id: string, overrides: Partial<ReportClaimView> = {}) => ({
  kind: 'claim' as const,
  id,
  claim: { id, title: id, detail: '', classification: 'verified_fact' as const, provider: 'Blockscout', observedAt: '2026-10-03T00:00:00.000Z', evidence: [{ chain: 'base', txHash: '0x1' }], evidenceTxHashes: ['0x1'], ...overrides },
});

describe('kesiapan laporan', () => {
  it('klaim tanpa provider, waktu, atau bukti fakta jadi blocker; dugaan tanpa bukti cukup peringatan', () => {
    const sections: ReportSectionView[] = [
      { id: '1', title: 'Temuan', blocks: [claim('lengkap'), claim('tanpa-sumber', { provider: null, observedAt: null }), claim('fakta-kosong', { evidence: [], evidenceTxHashes: [] })] },
      { id: '2', title: 'Dugaan', blocks: [claim('dugaan', { classification: 'heuristic', evidence: [], evidenceTxHashes: [] })] },
      { id: '3', title: 'Kosong', blocks: [] },
      { id: '4', title: 'Bukti', blocks: [{ kind: 'evidence', id: '9', chain: 'base', txHash: '0x2', caption: '' }] },
    ];
    const issues = reportIssues({ sections, snapshot: { dataStatus: 'partial', statusReason: 'Holder belum lengkap.' } }, new Set(['base:0x1']));
    expect(issues.map((issue) => [issue.kind, issue.level, issue.blockId])).toEqual([
      ['claim_without_provider', 'blocker', 'tanpa-sumber'],
      ['claim_without_time', 'blocker', 'tanpa-sumber'],
      ['fact_without_evidence', 'blocker', 'fakta-kosong'],
      ['claim_without_evidence', 'warning', 'dugaan'],
      ['empty_section', 'warning', null],
      ['evidence_not_stored', 'warning', '9'],
      ['snapshot_incomplete', 'warning', null],
    ]);
    expect(blockersOf(issues)).toHaveLength(3);
    expect(issues.at(-1)?.message).toBe('Holder belum lengkap.');
    // Tanpa daftar tersimpan, status bukti tersemat tidak dinilai.
    expect(reportIssues({ sections, snapshot: { dataStatus: 'complete', statusReason: null } }).some((issue) => issue.kind === 'evidence_not_stored')).toBe(false);
    expect(reportStats(sections)).toEqual({ sectionCount: 4, claimCount: 4, evidenceCount: 2 });
  });
});
