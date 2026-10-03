import { sortEvidenceNewestFirst, sortFindings } from './evidence-list.mapper.js';
import type { EvidenceRecord } from './evidence.view.js';

function record(id: number, blockNumber: number | null): EvidenceRecord {
  return {
    evidence: {
      id,
      evidenceKey: `k${id}`,
      chainId: 'robinhood',
      classification: 'verified_fact',
      explanation: '-',
      txHash: null,
      blockNumber,
      blockTimestamp: null,
      logIndex: null,
      sourceAddressId: null,
      destinationAddressId: null,
      asset: null,
      amountRaw: null,
      contractAddressId: null,
      method: null,
      heuristicName: null,
      confidence: null,
      providerRunId: null,
      fetchedAt: new Date('2026-10-03T00:00:00Z'),
    },
    sourceAddress: null,
    destinationAddress: null,
    contractAddress: null,
  };
}

describe('pengurutan bukti dan temuan', () => {
  it('bukti terbaru dulu, tanpa blok di akhir, seri diurut id', () => {
    const sorted = sortEvidenceNewestFirst([record(1, 10), record(2, null), record(3, 30), record(4, 10)]);
    expect(sorted.map((r) => r.evidence.id)).toEqual([3, 1, 4, 2]);
  });

  it('temuan paling parah dulu, lalu urutan simpan', () => {
    const sorted = sortFindings([
      { id: 1, severity: 'low' as const },
      { id: 2, severity: 'critical' as const },
      { id: 3, severity: 'medium' as const },
      { id: 4, severity: 'critical' as const },
      { id: 5, severity: 'info' as const },
    ]);
    expect(sorted.map((f) => f.id)).toEqual([2, 4, 3, 1, 5]);
  });
});
