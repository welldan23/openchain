import { filterFindings, findingFacets, sortFindings } from './risk-findings.mapper.js';
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
});
