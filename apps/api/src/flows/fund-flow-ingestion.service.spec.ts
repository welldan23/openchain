import type { PGlite } from '@electric-sql/pglite';
import { asc, count, eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../../test/support/database.js';
import type { Database } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import type { IndexedNativeTransfer, IndexedTokenTransfer, ProviderRunRecord } from '../providers/provider.types.js';
import { FundFlowIngestionService } from './fund-flow-ingestion.service.js';
import type { AddressFlowCollection, FlowScan, KindCoverage } from './fund-flow.types.js';

const SUBJECT = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const OTHER = '0x' + '22'.repeat(20);
const TOKEN = '0x' + 'Ee'.repeat(20);
const FETCHED_AT = new Date('2026-10-04T00:00:00Z');

const runOf = (operation: string, overrides: Partial<ProviderRunRecord> = {}): ProviderRunRecord => ({
  key: operation,
  provider: operation === 'chain.head' ? 'robinhood-rpc' : 'blockscout',
  kind: operation === 'chain.head' ? 'rpc' : 'indexed_data',
  operation,
  subject: SUBJECT,
  status: 'complete',
  errorReason: null,
  missingFields: [],
  blockFrom: null,
  blockTo: null,
  startedAt: FETCHED_AT,
  fetchedAt: FETCHED_AT,
  ...overrides,
});

const nativeOf = (seed: string, overrides: Partial<IndexedNativeTransfer> = {}): IndexedNativeTransfer => ({
  txHash: `0x${seed.repeat(32)}`,
  kind: 'transaction',
  tracePath: '',
  from: OTHER,
  to: SUBJECT,
  amountRaw: '1000000000000000000',
  blockNumber: 900,
  timestamp: new Date('2026-10-03T00:00:00Z'),
  ...overrides,
});

const tokenOf = (logIndex: number, overrides: Partial<IndexedTokenTransfer> = {}): IndexedTokenTransfer => ({
  txHash: `0x${'7f'.repeat(32)}`,
  logIndex,
  token: { address: TOKEN, symbol: 'TKN', name: 'Token', decimals: 18 },
  from: SUBJECT.toLowerCase(),
  to: OTHER,
  amountRaw: '500',
  blockNumber: 950,
  timestamp: new Date('2026-10-03T12:00:00Z'),
  ...overrides,
});

const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };
const completeScan: FlowScan = {
  blockFrom: 0,
  blockTo: 1_000,
  windowFrom: new Date('2026-10-03T00:00:00Z'),
  windowTo: FETCHED_AT,
  nativeScanned: true,
  tokensScanned: true,
  internalScanned: true,
  status: 'complete',
  statusReason: null,
  missingFields: [],
};

function collection(overrides: Partial<AddressFlowCollection> = {}): AddressFlowCollection {
  return {
    chainId: 'robinhood',
    address: SUBJECT,
    fetchedAt: FETCHED_AT,
    runs: [runOf('chain.head'), runOf('address.native_transfers'), runOf('address.internal_transfers'), runOf('address.token_transfers')],
    head: { blockNumber: 1_000, timestamp: FETCHED_AT },
    nativeTransfers: [nativeOf('a1'), nativeOf('a1', { kind: 'internal', tracePath: '3', from: SUBJECT, to: OTHER, amountRaw: '7' })],
    tokenTransfers: [tokenOf(1), tokenOf(2, { from: OTHER, to: SUBJECT })],
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: completeScan,
    failure: null,
    ...overrides,
  };
}

let client: PGlite;
let db: TestDatabase;
let service: FundFlowIngestionService;

beforeAll(async () => {
  ({ client, db } = await createTestDatabase());
  service = new FundFlowIngestionService(db as unknown as Database);
}, 60_000);

afterAll(async () => {
  await client.close();
});

describe('FundFlowIngestionService', () => {
  it('menyimpan transfer native, internal, token, run provider, dan cakupan pemindaian', async () => {
    const result = await service.persist(collection(), 'evm');
    expect(result).toMatchObject({
      chainId: 'robinhood',
      status: 'complete',
      failure: null,
      native: { found: 2, inserted: 2 },
      tokens: { found: 2, inserted: 2 },
    });
    expect(result.runs.map((run) => run.operation)).toEqual([
      'chain.head',
      'address.native_transfers',
      'address.internal_transfers',
      'address.token_transfers',
    ]);

    const [subject] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, SUBJECT.toLowerCase()));
    // Identifier asli disimpan, walau transfer token menulis address dengan huruf kecil.
    expect(subject.address).toBe(SUBJECT);

    const natives = await db.select().from(schema.nativeTransfers).orderBy(asc(schema.nativeTransfers.kind));
    expect(natives.map((row) => [row.kind, row.tracePath, row.amountRaw, row.amountUsd])).toEqual([
      ['transaction', '', '1000000000000000000', null],
      ['internal', '3', '7', null],
    ]);
    const internalRun = result.runs.find((run) => run.operation === 'address.internal_transfers');
    expect(natives[1].providerRunId).toBe(internalRun?.id);

    const [token] = await db.select().from(schema.tokens);
    expect(token).toMatchObject({ standard: 'erc20', symbol: 'TKN', decimals: 18 });
    const [{ total }] = await db.select({ total: count() }).from(schema.tokenTransfers);
    expect(total).toBe(2);

    const [scan] = await db.select().from(schema.addressFlowScans).where(eq(schema.addressFlowScans.id, result.scanId!));
    expect(scan).toMatchObject({ addressId: subject.id, blockFrom: 0, blockTo: 1_000, status: 'complete' });
  });

  it('pengumpulan ulang tidak menggandakan transfer, tapi tetap mencatat pemindaian baru', async () => {
    const result = await service.persist(collection(), 'evm');
    expect(result.native).toEqual({ found: 2, inserted: 0 });
    expect(result.tokens).toEqual({ found: 2, inserted: 0 });
    const [{ scans }] = await db.select({ scans: count() }).from(schema.addressFlowScans);
    expect(scans).toBe(2);
  });

  it('metadata token dari indexer tidak menimpa yang sudah ada, hanya mengisi yang kosong', async () => {
    await db.update(schema.tokens).set({ name: null });
    await service.persist(
      collection({
        nativeTransfers: [],
        tokenTransfers: [tokenOf(9, { txHash: `0x${'8e'.repeat(32)}`, token: { address: TOKEN, symbol: 'PALSU', name: 'Nama Baru', decimals: 6 } })],
      }),
      'evm',
    );
    const [token] = await db.select().from(schema.tokens);
    expect(token).toMatchObject({ symbol: 'TKN', decimals: 18, name: 'Nama Baru' });
  });

  it('chain tanpa sumber data: hanya run dan cakupan "tidak tersedia" yang disimpan', async () => {
    const result = await service.persist(
      collection({
        chainId: 'bsc',
        runs: [runOf('chain.head')],
        nativeTransfers: [],
        tokenTransfers: [],
        scan: {
          ...completeScan,
          blockFrom: 1_000,
          nativeScanned: false,
          internalScanned: false,
          tokensScanned: false,
          status: 'unavailable',
          statusReason: 'transfer native: Belum ada indexer riwayat address untuk chain ini',
          missingFields: ['native_transfers', 'internal_transfers', 'token_transfers'],
        },
        failure: 'Belum ada indexer riwayat address untuk chain ini',
      }),
      'evm',
    );
    expect(result).toMatchObject({ status: 'unavailable', native: { found: 0, inserted: 0 }, failure: expect.stringContaining('indexer') });
    expect(result.scanId).not.toBeNull();
  });

  it('tanpa rentang blok sama sekali: tidak ada baris cakupan, alasan tetap dilaporkan', async () => {
    const result = await service.persist(
      collection({ chainId: 'base', runs: [], nativeTransfers: [], tokenTransfers: [], head: null, scan: null, failure: 'Semua sumber riwayat transfer gagal dibaca' }),
      'evm',
    );
    expect(result).toMatchObject({ scanId: null, status: 'unavailable', statusReason: 'Semua sumber riwayat transfer gagal dibaca' });
  });
});
