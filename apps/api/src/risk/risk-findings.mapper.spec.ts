import { filterFindings, findingCaveats, findingFacets, findingNavigation, pointsShare, sortFindings } from './risk-findings.mapper.js';
import type { RiskFindingView } from './risk.types.js';

const finding = (id: string, overrides: Partial<RiskFindingView> = {}): RiskFindingView => ({
  id,
  kind: 'reason',
  title: id,
  description: '',
  severity: 'medium',
  classification: 'verified_fact',
  classificationInfo: { name: 'Fakta on-chain', description: '' },
  points: 5,
  trait: null,
  detectedAt: null,
  evidence: [],
  ...overrides,
});

describe('temuan risiko', () => {
  const all = [
    finding('a', { severity: 'low', points: 5 }),
    finding('b', { severity: 'high', points: 10, classification: 'heuristic', classificationInfo: { name: 'Dugaan', description: '' } }),
    finding('w1', { kind: 'warning', severity: 'high', points: null, detectedAt: '2026-10-01T00:00:00.000Z' }),
    finding('c', { severity: 'high', points: 20 }),
    finding('w2', { kind: 'warning', severity: 'high', points: null, detectedAt: '2026-10-02T00:00:00.000Z' }),
  ];

  it('terberat dulu; di tingkat sama alasan dulu (poin terbesar), lalu peringatan terbaru', () => {
    expect(sortFindings(all).map((item) => item.id)).toEqual(['c', 'b', 'w2', 'w1', 'a']);
  });

  it('saringan jenis informasi dan tingkat; facet dihitung dengan saringan lain tetap berlaku', () => {
    const filters = { classification: ['verified_fact' as const], severity: ['high' as const] };
    expect(filterFindings(all, filters).map((item) => item.id)).toEqual(['w1', 'c', 'w2']);
    expect(findingFacets(all, filters)).toEqual({
      classification: [
        { classification: 'verified_fact', name: 'Fakta on-chain', count: 3 },
        { classification: 'heuristic', name: 'Dugaan', count: 1 },
      ],
      severity: [
        { severity: 'high', count: 3 },
        { severity: 'low', count: 1 },
      ],
    });
  });

  it('rincian: porsi poin dari total terhitung, tetangga di urutan daftar', () => {
    expect(pointsShare(all[3], all)).toEqual({ countedPoints: 35, share: 57.1 });
    expect(pointsShare(all[2], all)).toEqual({ countedPoints: 35, share: null });
    expect(findingNavigation(all, 'reason', 'b')).toEqual({ previous: { kind: 'reason', id: 'c' }, next: { kind: 'warning', id: 'w2' }, position: 2, total: 5 });
    expect(findingNavigation(all, 'reason', 'a')).toMatchObject({ next: null, position: 5 });
  });

  it('rincian: catatan dugaan, bukti belum tersimpan, dan temuan tanpa hash', () => {
    const heuristic = findingCaveats({ kind: 'reason', classification: 'heuristic', points: 5 }, [{ stored: true }, { stored: false }], [], 35);
    expect(heuristic.join(' ')).toContain('bisa keliru');
    expect(heuristic.join(' ')).toContain('1 hash bukti belum tersimpan');
    const noHash = findingCaveats({ kind: 'reason', classification: 'derived_metric', points: 8 }, [], ['blockscout'], 120);
    expect(noHash.join(' ')).toContain('dibatasi 100');
    expect(noHash.join(' ')).toContain('sumber data penilaian: blockscout');
    expect(findingCaveats({ kind: 'warning', classification: 'verified_fact', points: null }, [{ stored: true }], [], 0)).toEqual([
      'Peringatan dini tidak menambah skor; ini pola baru yang perlu dipantau.',
    ]);
  });
});
