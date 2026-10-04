import type { BridgeMoveView, MultichainChainView } from './multichain.types.js';
import { columnLeaders, comparisonRows, sortComparison, summarizeComparison } from './multichain-comparison.js';

function view(id: string, extra: Partial<MultichainChainView> = {}): MultichainChainView {
  return {
    chain: { id, name: id.toUpperCase(), nativeSymbol: 'ETH', explorerUrl: null, supportStatus: 'validated' },
    known: true,
    status: 'complete',
    statusReason: null,
    flowScanId: 1,
    txCount: 0,
    inCount: 0,
    outCount: 0,
    inUsd: null,
    outUsd: null,
    unpricedCount: 0,
    counterpartyCount: 0,
    firstSeen: null,
    lastSeen: null,
    nativeBalanceRaw: null,
    balanceUsd: null,
    snapshotBlock: 1,
    fetchedAt: null,
    ...extra,
  };
}

const bridge = (fromChain: string, toChain: string | null, status: BridgeMoveView['status']): BridgeMoveView => ({
  id: 1,
  fromChain,
  toChain,
  protocolId: null,
  bridgeAddress: '0x',
  status,
  amountSentRaw: '1',
  amountReceivedRaw: null,
  amountUsd: null,
  sentTxHash: '0x',
  sentAt: '2026-10-01T00:00:00Z',
  receivedTxHash: null,
  receivedAt: null,
  matchClassification: 'heuristic',
  matchConfidence: null,
  matchReason: null,
});

const chains = [
  view('ethereum', { txCount: 30, inUsd: 1000, outUsd: 400, counterpartyCount: 12, firstSeen: '2026-01-01T00:00:00.000Z' }),
  view('base', { txCount: 10, inUsd: 50, outUsd: null, unpricedCount: 3, counterpartyCount: 20, status: 'stale' }),
  view('arbitrum'),
  view('bsc', { status: 'unavailable', statusReason: 'Belum dipindai', txCount: null, counterpartyCount: null, unpricedCount: null, flowScanId: null }),
];
const bridges = [bridge('base', 'ethereum', 'matched'), bridge('base', null, 'pending')];

describe('perbandingan multichain', () => {
  it('membuat baris per chain tanpa mengubah nilai yang tidak diketahui menjadi nol', () => {
    const rows = comparisonRows(chains, bridges);
    expect(rows.map((row) => [row.chain, row.active, row.txSharePct, row.netUsd, row.bridgesOut, row.bridgesIn])).toEqual([
      ['ethereum', true, 75, 600, 0, 1],
      ['base', true, 25, null, 2, 0],
      ['arbitrum', false, 0, 0, 0, 0],
      ['bsc', false, null, null, 0, 0],
    ]);
    expect(rows[3]).toMatchObject({ txCount: null, counterpartyCount: null, statusReason: 'Belum dipindai' });
  });

  it('mengurutkan dengan chain tidak aktif dan tidak terbaca selalu di bawah', () => {
    const rows = comparisonRows(chains, bridges);
    expect(sortComparison(rows, 'counterpartyCount', 'desc').map((row) => row.chain)).toEqual(['base', 'ethereum', 'arbitrum', 'bsc']);
    expect(sortComparison(rows, 'txCount', 'asc').map((row) => row.chain)).toEqual(['base', 'ethereum', 'arbitrum', 'bsc']);
    expect(sortComparison(rows, 'netUsd', 'desc').map((row) => row.chain)).toEqual(['ethereum', 'base', 'arbitrum', 'bsc']);
    expect(sortComparison(rows, 'firstSeen', 'asc').map((row) => row.chain)).toEqual(['ethereum', 'base', 'arbitrum', 'bsc']);
  });

  it('juara kolom hanya dari chain aktif dengan nilai positif', () => {
    expect(columnLeaders(comparisonRows(chains, bridges))).toEqual({ txCount: 'ethereum', inUsd: 'ethereum', outUsd: 'ethereum', netUsd: 'ethereum', counterpartyCount: 'base' });
  });

  it('meringkas chain aktif, tidak aktif, tidak terbaca, basi, dan bridge yang belum cocok', () => {
    expect(summarizeComparison(comparisonRows(chains, bridges), bridges)).toEqual({
      activeChains: ['ethereum', 'base'],
      inactiveChains: ['arbitrum'],
      unavailableChains: ['bsc'],
      staleChains: ['base'],
      totalTx: 40,
      inUsd: 1050,
      outUsd: 400,
      busiestChain: 'ethereum',
      bridgeCount: 2,
      unmatchedBridges: 1,
    });
    expect(summarizeComparison(comparisonRows([view('arbitrum')], []), []).inUsd).toBeNull();
  });
});
