import { effectiveStatus, toTokenSummary, type TokenSummaryRows } from './token-summary.mapper.js';

const NOW = new Date('2026-10-03T06:00:00Z');

const rows: TokenSummaryRows = {
  chain: {
    id: 'robinhood',
    family: 'evm',
    evmChainId: 4663,
    name: 'Robinhood Chain',
    nativeSymbol: 'ETH',
    explorerUrl: null,
    supportStatus: 'planned',
    createdAt: NOW,
  },
  token: {
    id: 1,
    chainId: 'robinhood',
    addressId: 10,
    standard: 'erc20',
    name: 'Nebula Finance',
    symbol: 'NBLA',
    decimals: 18,
    totalSupplyRaw: '1000000000000000000000000000',
    deployerAddressId: 11,
    deployTxHash: `0x${'ab'.repeat(32)}`,
    deployedAt: new Date('2026-09-12T08:14:00Z'),
    sourceVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  address: '0x86C8862bA06BEFeEd8bC12d165A430166395D5a3',
  deployer: '0x' + '1'.repeat(40),
  snapshot: null,
  sources: [],
};

describe('effectiveStatus', () => {
  const fetchedAt = new Date('2026-10-03T05:30:00Z');

  it('mempertahankan status selama snapshot masih segar', () => {
    expect(effectiveStatus('complete', fetchedAt, NOW, 60)).toBe('complete');
    expect(effectiveStatus('partial', fetchedAt, NOW, 60)).toBe('partial');
  });

  it('menandai snapshot lama sebagai stale', () => {
    expect(effectiveStatus('complete', fetchedAt, NOW, 15)).toBe('stale');
    expect(effectiveStatus('partial', fetchedAt, NOW, 15)).toBe('stale');
  });

  it('tidak mengubah status unavailable', () => {
    expect(effectiveStatus('unavailable', fetchedAt, NOW, 15)).toBe('unavailable');
  });
});

describe('toTokenSummary', () => {
  it('melaporkan unavailable dan tidak mengarang angka bila belum ada snapshot', () => {
    const summary = toTokenSummary(rows, NOW, 60);
    expect(summary.snapshot).toBeNull();
    expect(summary.dataStatus).toBe('unavailable');
    expect(summary.market).toBeNull();
    expect(summary.concentration).toBeNull();
    expect(summary.risk).toEqual({ score: null, level: 'unknown' });
    expect(summary.token.totalSupply).toBe('1000000000');
    expect(summary.token.totalSupplyRaw).toBe('1000000000000000000000000000');
    expect(summary.chain.supportStatus).toBe('planned');
  });

  it('mengubah kolom numeric menjadi angka dan menyertakan provider', () => {
    const summary = toTokenSummary(
      {
        ...rows,
        snapshot: {
          id: 5,
          tokenId: 1,
          blockNumber: 23512880,
          fetchedAt: new Date('2026-10-03T05:30:00Z'),
          dataStatus: 'partial',
          priceUsd: '0.004213000000000000',
          priceChange24hPct: '12.4000',
          marketCapUsd: '4213000.00',
          fdvUsd: '4213000.00',
          liquidityUsd: '612400.00',
          volume24hUsd: '1843000.00',
          holderCount: 3482,
          txCount24h: 2915,
          top10Pct: '61.8000',
          top50Pct: '78.3000',
          riskScore: 68,
          riskLevel: 'high',
        },
        sources: [
          {
            id: 1,
            provider: 'blockscout',
            kind: 'explorer',
            chainId: 'robinhood',
            operation: 'token.holders',
            subject: null,
            status: 'partial',
            errorReason: null,
            blockFrom: null,
            blockTo: null,
            missingFields: ['holders.balance'],
            startedAt: NOW,
            fetchedAt: new Date('2026-10-03T05:29:00Z'),
          },
        ],
      },
      NOW,
      60,
    );
    expect(summary.dataStatus).toBe('partial');
    expect(summary.market).toEqual({
      priceUsd: 0.004213,
      priceChange24hPct: 12.4,
      marketCapUsd: 4213000,
      fdvUsd: 4213000,
      liquidityUsd: 612400,
      volume24hUsd: 1843000,
      holderCount: 3482,
      txCount24h: 2915,
    });
    expect(summary.concentration).toEqual({ top10Pct: 61.8, top50Pct: 78.3 });
    expect(summary.risk).toEqual({ score: 68, level: 'high' });
    expect(summary.snapshot?.sources).toEqual([
      {
        provider: 'blockscout',
        kind: 'explorer',
        operation: 'token.holders',
        status: 'partial',
        fetchedAt: '2026-10-03T05:29:00.000Z',
        errorReason: null,
        missingFields: ['holders.balance'],
      },
    ]);
  });
});
