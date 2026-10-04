import { caseSnapshot, type SubjectSource } from './case-snapshot.js';

const NOW = new Date('2026-10-04T00:00:00Z');
const rank = (chainId: string) => ['robinhood', 'ethereum', 'base'].indexOf(chainId);
const source = (chainId: string, blockNumber: number, status: SubjectSource['status'] = 'complete', providers = ['blockscout']): SubjectSource => ({
  chainId,
  blockNumber,
  fetchedAt: new Date(`2026-10-03T0${blockNumber % 10}:00:00Z`),
  status,
  providers,
});

describe('snapshot kasus', () => {
  it('tanpa subjek atau tanpa data: tidak tersedia, dengan alasan', () => {
    expect(caseSnapshot([], NOW, rank)).toMatchObject({ dataStatus: 'unavailable', snapshotAt: NOW, blocks: [], sources: [] });
    const none = caseSnapshot([{ title: 'BRETT', sources: [] }], NOW, rank);
    expect(none).toMatchObject({ dataStatus: 'unavailable' });
    expect(none.statusReason).toContain('BRETT');
  });

  it('semua lengkap: blok tertinggi per chain, provider unik, waktu data terbaru', () => {
    const snapshot = caseSnapshot(
      [
        { title: 'A', sources: [source('base', 101), source('ethereum', 52, 'complete', ['etherscan', 'blockscout'])] },
        { title: 'B', sources: [source('base', 103)] },
      ],
      NOW,
      rank,
    );
    expect(snapshot).toEqual({
      snapshotAt: new Date('2026-10-03T03:00:00Z'),
      blocks: [
        { chainId: 'ethereum', blockNumber: 52 },
        { chainId: 'base', blockNumber: 103 },
      ],
      sources: ['blockscout', 'etherscan'],
      dataStatus: 'complete',
      statusReason: null,
    });
  });

  it('sebagian bila ada subjek tanpa data atau datanya tidak lengkap', () => {
    const snapshot = caseSnapshot(
      [
        { title: 'A', sources: [source('base', 101, 'partial')] },
        { title: 'B', sources: [] },
        { title: 'C', sources: [source('robinhood', 5, 'stale')] },
      ],
      NOW,
      rank,
    );
    expect(snapshot.dataStatus).toBe('partial');
    expect(snapshot.statusReason).toBe('Belum ada data tersimpan untuk B; data A, C tidak lengkap.');
  });
});
