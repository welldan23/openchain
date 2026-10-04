import type { IndexedNativeTransfer } from '../providers/provider.types.js';
import { summarizeCoverage } from './fund-flow-coverage.js';
import type { KindCoverage } from './fund-flow.types.js';

const at = (iso: string) => new Date(iso);
const HEAD = { blockNumber: 1_000, timestamp: at('2026-10-04T00:00:00Z') };

const done = (oldest: KindCoverage['oldest'] = null): KindCoverage => ({ failure: null, exhausted: true, pages: 1, oldest, skipped: null });
const truncated = (blockNumber: number, iso: string): KindCoverage => ({
  failure: null,
  exhausted: false,
  pages: 5,
  oldest: { blockNumber, timestamp: at(iso) },
  skipped: null,
});
const failed = (reason: string): KindCoverage => ({ failure: reason, exhausted: false, pages: 0, oldest: null, skipped: null });

const transfer = (blockNumber: number, iso: string): IndexedNativeTransfer => ({
  txHash: `0x${blockNumber}`,
  kind: 'transaction',
  tracePath: '',
  from: '0xa',
  to: '0xb',
  amountRaw: '1',
  blockNumber,
  timestamp: at(iso),
});

describe('cakupan pemindaian aliran dana', () => {
  it('riwayat habis dibaca untuk semua jenis: lengkap dari blok 0 sampai blok terbaru', () => {
    const scan = summarizeCoverage({
      coverage: { native: done(), internal: done(), tokens: done() },
      head: HEAD,
      nativeTransfers: [transfer(10, '2026-09-01T00:00:00Z'), transfer(900, '2026-10-03T00:00:00Z')],
      tokenTransfers: [],
    });
    expect(scan).toEqual({
      blockFrom: 0,
      blockTo: 1_000,
      windowFrom: at('2026-09-01T00:00:00Z'),
      windowTo: HEAD.timestamp,
      nativeScanned: true,
      internalScanned: true,
      tokensScanned: true,
      status: 'complete',
      statusReason: null,
      missingFields: [],
    });
  });

  it('jenis yang terpotong membatasi rentang; blok item tertua tidak dihitung lengkap', () => {
    const scan = summarizeCoverage({
      coverage: {
        native: done(),
        internal: truncated(700, '2026-09-20T00:00:00Z'),
        tokens: truncated(500, '2026-09-10T00:00:00Z'),
      },
      head: HEAD,
      nativeTransfers: [],
      tokenTransfers: [],
    });
    expect(scan).toMatchObject({ blockFrom: 701, windowFrom: at('2026-09-20T00:00:00Z'), status: 'complete' });
  });

  it('jenis yang gagal membuat status sebagian dengan alasan dan field yang hilang', () => {
    const scan = summarizeCoverage({
      coverage: { native: done(), internal: failed('Indexer tidak membuka transaksi internal'), tokens: done() },
      head: HEAD,
      nativeTransfers: [transfer(10, '2026-09-01T00:00:00Z')],
      tokenTransfers: [],
    });
    expect(scan).toMatchObject({
      blockFrom: 0,
      internalScanned: false,
      status: 'partial',
      statusReason: 'Transfer internal: Indexer tidak membuka transaksi internal.',
      missingFields: ['internal_transfers'],
    });
  });

  it('semua gagal: tidak tersedia, dengan rentang kosong di blok terbaru', () => {
    const scan = summarizeCoverage({
      coverage: { native: failed('HTTP 503'), internal: failed('HTTP 503'), tokens: failed('HTTP 503') },
      head: HEAD,
      nativeTransfers: [],
      tokenTransfers: [],
    });
    expect(scan).toMatchObject({ blockFrom: 1_000, blockTo: 1_000, status: 'unavailable' });
    expect(scan?.missingFields).toEqual(['native_transfers', 'internal_transfers', 'token_transfers']);
    // Alasan yang sama untuk semua jenis cukup ditulis sekali.
    expect(scan?.statusReason).toBe('Transfer native, transfer internal, transfer token: HTTP 503.');
  });

  it('tanpa blok terbaru: batas atas dari transfer terbaru dan tidak boleh disebut lengkap', () => {
    const scan = summarizeCoverage({
      coverage: { native: done(), internal: done(), tokens: done() },
      head: null,
      nativeTransfers: [transfer(10, '2026-09-01T00:00:00Z'), transfer(42, '2026-09-02T00:00:00Z')],
      tokenTransfers: [],
    });
    expect(scan).toMatchObject({ blockTo: 42, windowTo: at('2026-09-02T00:00:00Z'), status: 'partial', missingFields: ['chain_head'] });
    expect(summarizeCoverage({ coverage: { native: done(), internal: done(), tokens: done() }, head: null, nativeTransfers: [], tokenTransfers: [] })).toBeNull();
  });

  it('riwayat lengkap tanpa transfer sama sekali: rentang waktu dimulai dan berakhir di blok terbaru', () => {
    const scan = summarizeCoverage({
      coverage: { native: done(), internal: done(), tokens: done() },
      head: HEAD,
      nativeTransfers: [],
      tokenTransfers: [],
    });
    expect(scan).toMatchObject({ blockFrom: 0, windowFrom: HEAD.timestamp, windowTo: HEAD.timestamp, status: 'complete' });
  });
});
