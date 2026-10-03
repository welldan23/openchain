import { sortLabels } from './holders.mapper.js';
import type { labels } from '../database/schema/index.js';

type LabelRow = typeof labels.$inferSelect;

function label(id: number, source: LabelRow['source'], confidence: string | null): LabelRow {
  return {
    id,
    addressId: 1,
    labelType: 'bot',
    name: null,
    source,
    sourceName: `sumber-${id}`,
    classification: source === 'external' ? 'external_label' : source === 'heuristic' ? 'heuristic' : 'assumption',
    confidence,
    providerRunId: null,
    createdAt: new Date('2026-10-03T00:00:00Z'),
  };
}

describe('sortLabels', () => {
  it('menaruh label eksternal dulu, lalu heuristic dengan confidence tertinggi, lalu user', () => {
    const sorted = sortLabels([
      label(1, 'user', null),
      label(2, 'heuristic', '0.400'),
      label(3, 'external', '0.700'),
      label(4, 'heuristic', '0.900'),
      label(5, 'external', null),
    ]);
    expect(sorted.map((row) => row.id)).toEqual([3, 5, 4, 2, 1]);
  });

  it('tidak mengubah array asli', () => {
    const input = [label(2, 'user', null), label(1, 'external', null)];
    sortLabels(input);
    expect(input.map((row) => row.id)).toEqual([2, 1]);
  });
});
