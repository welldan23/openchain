import { InvalidIdentifierError } from '../database/identifiers.js';
import {
  ProviderError,
  type ActivityPage,
  type AddressActivityProvider,
  type IndexedNativeTransfer,
  type IndexedTokenTransfer,
  type PageCursor,
  type RpcProvider,
  type SkippedCounts,
} from '../providers/provider.types.js';
import { FundFlowCollector, type FundFlowSources } from './fund-flow-collector.js';

const ADDRESS = '0x' + 'ab'.repeat(20);
const NOW = new Date('2026-10-04T00:00:00Z');
const clock = { now: () => NOW };

const native = (blockNumber: number, kind: 'transaction' | 'internal' = 'transaction'): IndexedNativeTransfer => ({
  txHash: `0x${String(blockNumber).padStart(64, '0')}`,
  kind,
  tracePath: kind === 'internal' ? '0' : '',
  from: ADDRESS,
  to: '0x' + 'cd'.repeat(20),
  amountRaw: '1000',
  blockNumber,
  timestamp: new Date(Date.UTC(2026, 8, 1) + blockNumber * 1000),
});

const token = (blockNumber: number): IndexedTokenTransfer => ({
  txHash: `0x${String(blockNumber).padStart(64, 'f')}`,
  logIndex: 1,
  token: { address: '0x' + 'ee'.repeat(20), symbol: 'TKN', name: 'Token', decimals: 18 },
  from: '0x' + 'cd'.repeat(20),
  to: ADDRESS,
  amountRaw: '5',
  blockNumber,
  timestamp: new Date(Date.UTC(2026, 8, 1) + blockNumber * 1000),
});

const none: SkippedCounts = { pending: 0, failed: 0, zeroValue: 0 };

/** Daftar halaman; tiap halaman menunjuk halaman berikutnya lewat cursor `page`. */
function paged<T>(pages: T[][], skipped: SkippedCounts = none) {
  const calls: Array<PageCursor | null> = [];
  const fetch = async (cursor: PageCursor | null): Promise<ActivityPage<T> & { skipped: SkippedCounts }> => {
    calls.push(cursor);
    const index = cursor ? Number(cursor.page) : 0;
    return { items: pages[index] ?? [], next: index + 1 < pages.length ? { page: String(index + 1) } : null, skipped };
  };
  return { fetch, calls };
}

function rpcWithHead(blockNumber: number | Error): RpcProvider {
  return {
    name: 'test-rpc',
    getBlock: async () => {
      if (blockNumber instanceof Error) throw blockNumber;
      return { number: blockNumber, hash: '0x', timestamp: NOW, transactionHashes: [] };
    },
  } as unknown as RpcProvider;
}

function activity(parts: {
  native?: ReturnType<typeof paged<IndexedNativeTransfer>> | Error;
  internal?: ReturnType<typeof paged<IndexedNativeTransfer>> | Error;
  tokens?: ReturnType<typeof paged<IndexedTokenTransfer>> | Error;
}): AddressActivityProvider {
  const call = <T,>(part: { fetch: (cursor: PageCursor | null) => Promise<T> } | Error | undefined, cursor: PageCursor | null) => {
    if (part instanceof Error) return Promise.reject(part);
    if (!part) return paged([[]]).fetch(cursor) as unknown as Promise<T>;
    return part.fetch(cursor);
  };
  return {
    name: 'test-indexer',
    getNativeTransfers: (_address, cursor) => call(parts.native, cursor),
    getInternalTransfers: (_address, cursor) => call(parts.internal, cursor),
    getTokenTransfers: (_address, cursor) => call(parts.tokens, cursor),
  };
}

function collector(sources: Partial<FundFlowSources> = {}, maxPages = 5) {
  const resolved: FundFlowSources = { family: 'evm', activity: null, rpc: rpcWithHead(1_000), ...sources };
  return new FundFlowCollector(() => resolved, clock, { maxPages });
}

describe('FundFlowCollector', () => {
  it('membaca semua halaman ketiga jenis transfer dan menandai cakupan lengkap', async () => {
    const nativePages = paged([[native(900), native(800)], [native(100)]]);
    const result = await collector({
      activity: activity({ native: nativePages, internal: paged([[native(850, 'internal')]]), tokens: paged([[token(950)]]) }),
    }).collect('robinhood', `  ${ADDRESS}  `);
    expect(result.address).toBe(ADDRESS);
    expect(nativePages.calls).toEqual([null, { page: '1' }]);
    expect(result.nativeTransfers).toHaveLength(4);
    expect(result.tokenTransfers).toHaveLength(1);
    expect(result.scan).toMatchObject({ blockFrom: 0, blockTo: 1_000, status: 'complete', missingFields: [] });
    expect(result.failure).toBeNull();
    expect(result.runs.map((run) => [run.operation, run.status, run.blockFrom, run.blockTo])).toEqual([
      ['chain.head', 'complete', 1_000, 1_000],
      ['address.native_transfers', 'complete', 0, 900],
      ['address.internal_transfers', 'complete', 0, 850],
      ['address.token_transfers', 'complete', 0, 950],
    ]);
  });

  it('berhenti di batas halaman dan mempersempit rentang ke bagian yang lengkap', async () => {
    const result = await collector(
      { activity: activity({ native: paged([[native(900)], [native(600)], [native(300)]]) }) },
      2,
    ).collect('robinhood', ADDRESS);
    expect(result.coverage.native).toMatchObject({ exhausted: false, pages: 2, oldest: { blockNumber: 600 } });
    expect(result.scan).toMatchObject({ blockFrom: 601, status: 'complete' });
    expect(result.runs[1]).toMatchObject({ blockFrom: 600, blockTo: 900 });
  });

  it('halaman berisi transaksi tanpa nilai saja tetap memperluas cakupan sampai blok tertua yang terbaca', async () => {
    const zeroOnly = {
      fetch: async (cursor: PageCursor | null) => ({
        items: [],
        next: cursor ? { page: '2' } : { page: '1' },
        skipped: { pending: 0, failed: 0, zeroValue: 50 },
        oldestSeen: cursor ? { blockNumber: 400, timestamp: new Date('2026-09-20T00:00:00Z') } : { blockNumber: 800, timestamp: new Date('2026-09-30T00:00:00Z') },
      }),
    };
    const result = await collector({ activity: activity({ native: zeroOnly as never }) }, 2).collect('robinhood', ADDRESS);
    expect(result.nativeTransfers).toEqual([]);
    expect(result.coverage.native).toMatchObject({ oldest: { blockNumber: 400 }, skipped: { zeroValue: 100 } });
    expect(result.scan).toMatchObject({ blockFrom: 401, windowFrom: new Date('2026-09-20T00:00:00Z'), status: 'complete' });
  });

  it('jenis yang gagal tidak menghapus jenis lain dan halaman setengah jalan tidak dipakai', async () => {
    let calls = 0;
    const flaky = {
      fetch: async (cursor: PageCursor | null) => {
        calls += 1;
        if (cursor) throw new ProviderError('test-indexer', 'HTTP 503');
        return { items: [token(990)], next: { page: '1' } };
      },
    };
    const result = await collector({
      activity: activity({ native: paged([[native(900)]]), internal: new ProviderError('test-indexer', 'Endpoint internal tidak ada'), tokens: flaky as never }),
    }).collect('robinhood', ADDRESS);
    expect(calls).toBe(2);
    expect(result.nativeTransfers).toHaveLength(1);
    expect(result.tokenTransfers).toEqual([]);
    expect(result.scan).toMatchObject({
      status: 'partial',
      nativeScanned: true,
      internalScanned: false,
      tokensScanned: false,
      missingFields: ['internal_transfers', 'token_transfers'],
    });
    expect(result.runs.filter((run) => run.status === 'unavailable').map((run) => run.errorReason)).toEqual([
      'Endpoint internal tidak ada',
      'HTTP 503',
    ]);
  });

  it('tidak membocorkan pesan error mentah yang bukan dari provider', async () => {
    const result = await collector({
      activity: activity({ native: new Error('connect ECONNREFUSED https://rahasia.example/?key=abc') }),
    }).collect('robinhood', ADDRESS);
    const reason = result.runs.find((run) => run.operation === 'address.native_transfers')?.errorReason;
    expect(reason).toBe('Kesalahan tak terduga saat membaca provider');
    expect(JSON.stringify(result)).not.toContain('rahasia');
  });

  it('chain tanpa indexer: tidak tersedia, dengan alasan, tanpa menghubungi apa pun selain RPC', async () => {
    const result = await collector({ activity: null }).collect('bsc', ADDRESS);
    expect(result.failure).toBe('Belum ada indexer riwayat address untuk chain ini');
    expect(result.scan).toMatchObject({ status: 'unavailable', blockFrom: 1_000, blockTo: 1_000 });
    expect(result.runs.map((run) => run.operation)).toEqual(['chain.head']);
  });

  it('RPC gagal: cakupan memakai transfer terbaru dan statusnya sebagian', async () => {
    const result = await collector({
      rpc: rpcWithHead(new ProviderError('test-rpc', 'timeout')),
      activity: activity({ native: paged([[native(700)]]) }),
    }).collect('robinhood', ADDRESS);
    expect(result.head).toBeNull();
    expect(result.scan).toMatchObject({ blockTo: 700, status: 'partial', missingFields: ['chain_head'] });
    expect(result.runs[0]).toMatchObject({ operation: 'chain.head', status: 'unavailable', errorReason: 'timeout' });
  });

  it('menolak address yang salah format sebelum menghubungi provider', async () => {
    const indexer = activity({ native: new ProviderError('x', 'tidak boleh dipanggil') });
    await expect(collector({ activity: indexer }).collect('robinhood', '0x1234')).rejects.toBeInstanceOf(InvalidIdentifierError);
  });

  it('mengumpulkan di beberapa chain; satu chain gagal tidak menggagalkan yang lain', async () => {
    const byChain: Record<string, FundFlowSources> = {
      ethereum: { family: 'evm', activity: activity({ native: paged([[native(10)]]) }), rpc: rpcWithHead(100) },
      bsc: { family: 'evm', activity: null, rpc: rpcWithHead(200) },
    };
    const results = await new FundFlowCollector((chainId) => byChain[chainId], clock).collectAcross(['ethereum', 'bsc'], ADDRESS);
    expect(results.map((result) => [result.chainId, result.scan?.status])).toEqual([
      ['ethereum', 'complete'],
      ['bsc', 'unavailable'],
    ]);
  });
});
