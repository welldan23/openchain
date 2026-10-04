import type { FlowLabelView } from '../flows/flow-summary.types.js';
import { edgeMatches, labelCounts, NO_FILTER, nodeMatches, primaryLabelKey } from './map-filter.js';

const label = (type: string, source: FlowLabelView['source']): FlowLabelView => ({
  type,
  name: null,
  source,
  sourceName: source === 'external' ? 'Blockscout' : 'OpenChain heuristic',
  classification: source === 'external' ? 'external_label' : 'heuristic',
  confidence: source === 'external' ? null : 0.6,
});

describe('filter peta', () => {
  it('menyaring garis menurut jenis dan rentang waktu inklusif', () => {
    const edge = { kind: 'funding' as const, timestamp: new Date('2026-10-01T10:00:00Z') };
    expect(edgeMatches(edge, NO_FILTER)).toBe(true);
    expect(edgeMatches(edge, { ...NO_FILTER, kinds: new Set(['token_transfer']) })).toBe(false);
    expect(edgeMatches(edge, { ...NO_FILTER, kinds: new Set() })).toBe(true);
    expect(edgeMatches(edge, { ...NO_FILTER, from: edge.timestamp, to: edge.timestamp })).toBe(true);
    expect(edgeMatches(edge, { ...NO_FILTER, from: new Date('2026-10-01T10:00:01Z') })).toBe(false);
    expect(edgeMatches(edge, { ...NO_FILTER, to: new Date('2026-10-01T09:59:59Z') })).toBe(false);
  });

  it('menyaring wallet menurut label utama dan sumbernya; tanpa label ikut tersembunyi saat sumber dipilih', () => {
    const exchange = [label('exchange', 'external'), label('whale', 'heuristic')];
    const whale = [label('whale', 'heuristic')];
    expect(primaryLabelKey([])).toBe('none');
    expect(nodeMatches(exchange, { ...NO_FILTER, hide: new Set(['exchange']) })).toBe(false);
    expect(nodeMatches(exchange, { ...NO_FILTER, hide: new Set(['whale']) })).toBe(true);
    expect(nodeMatches([], { ...NO_FILTER, hide: new Set(['none']) })).toBe(false);
    expect(nodeMatches(whale, { ...NO_FILTER, labelSource: 'heuristic' })).toBe(true);
    expect(nodeMatches(exchange, { ...NO_FILTER, labelSource: 'heuristic' })).toBe(false);
    expect(nodeMatches([], { ...NO_FILTER, labelSource: 'external' })).toBe(false);
  });

  it('menghitung jenis label utama, terbanyak dulu dan tanpa label paling akhir', () => {
    const nodes = [[], [], [], [label('exchange', 'external')], [label('whale', 'heuristic')], [label('whale', 'heuristic')]].map((labels) => ({ labels }));
    expect(labelCounts(nodes)).toEqual([
      { type: 'whale', count: 2 },
      { type: 'exchange', count: 1 },
      { type: 'none', count: 3 },
    ]);
  });
});
