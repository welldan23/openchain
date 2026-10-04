import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import type { IndexedNativeTransfer, IndexedTokenTransfer, ProviderRunRecord } from '../src/providers/provider.types.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const WALLET = '0x7E5bF5e0E4897549C5d1B4D22BfE8Ad1A50B7DC8';
const FUNDER = '0x' + 'f1'.repeat(20);
const EXCHANGE = '0x' + 'e2'.repeat(20);
const BUNDLER_A = '0x' + 'b1'.repeat(20);
const BUNDLER_B = '0x' + 'b2'.repeat(20);
const TOKEN = '0x' + 'aa'.repeat(20);
const NEVER_SCANNED = '0x' + 'cc'.repeat(20);
const SCANNED_AT = new Date('2026-10-03T04:30:00Z');
const ETH = (whole: string) => `${whole}000000000000000000`;

let seq = 0;
const hash = () => `0x${(++seq).toString(16).padStart(64, '0')}`;

const run = (operation: string, status: ProviderRunRecord['status'] = 'complete'): ProviderRunRecord => ({
  key: operation,
  provider: operation === 'chain.head' ? 'robinhood-rpc' : 'blockscout',
  kind: operation === 'chain.head' ? 'rpc' : 'indexed_data',
  operation,
  subject: WALLET,
  status,
  errorReason: status === 'unavailable' ? 'HTTP 503' : null,
  missingFields: [],
  blockFrom: null,
  blockTo: null,
  startedAt: SCANNED_AT,
  fetchedAt: SCANNED_AT,
});

const native = (from: string, to: string, amountRaw: string, blockNumber: number, iso: string, kind: 'transaction' | 'internal' = 'transaction'): IndexedNativeTransfer => ({
  txHash: hash(),
  kind,
  tracePath: kind === 'internal' ? '0' : '',
  from,
  to,
  amountRaw,
  blockNumber,
  timestamp: new Date(iso),
});

const tokenTransfer = (from: string, to: string, amountRaw: string, blockNumber: number, iso: string): IndexedTokenTransfer => ({
  txHash: hash(),
  logIndex: 0,
  token: { address: TOKEN, symbol: 'NBLA', name: 'Nebula Finance', decimals: 18 },
  from,
  to,
  amountRaw,
  blockNumber,
  timestamp: new Date(iso),
});

const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };

function collection(overrides: Partial<AddressFlowCollection>): AddressFlowCollection {
  return {
    chainId: 'robinhood',
    address: WALLET,
    fetchedAt: SCANNED_AT,
    runs: [run('chain.head'), run('address.native_transfers'), run('address.internal_transfers'), run('address.token_transfers')],
    head: { blockNumber: 1_000, timestamp: SCANNED_AT },
    nativeTransfers: [],
    tokenTransfers: [],
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 1_000,
      windowFrom: new Date('2026-09-01T00:00:00Z'),
      windowTo: SCANNED_AT,
      nativeScanned: true,
      tokensScanned: true,
      internalScanned: true,
      status: 'complete',
      statusReason: null,
      missingFields: [],
    },
    partyLabels: [],
    failure: null,
    ...overrides,
  };
}

describe('GET /api/flows/:chain/:address/summary', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');
  let firstScanId: number;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const ingestion = new FundFlowIngestionService(db as unknown as Database);
    const first = await ingestion.persist(
      collection({
        nativeTransfers: [
          native(EXCHANGE, WALLET, ETH('10'), 100, '2026-09-10T00:00:00Z'),
          native(FUNDER, WALLET, ETH('2'), 200, '2026-09-20T00:00:00Z'),
          native(WALLET, BUNDLER_A, ETH('2'), 300, '2026-09-21T00:00:00Z'),
          native(WALLET, BUNDLER_B, ETH('1'), 310, '2026-09-21T01:00:00Z'),
          native(BUNDLER_A, WALLET, '123', 320, '2026-09-22T00:00:00Z', 'internal'),
          // Transfer ke diri sendiri tidak dihitung masuk maupun keluar.
          native(WALLET, WALLET, ETH('5'), 330, '2026-09-23T00:00:00Z'),
        ],
        tokenTransfers: [
          // Lebih besar dari 2^64: jumlahnya harus tetap presisi.
          tokenTransfer(BUNDLER_A, WALLET, '123456789012345678901234567890', 400, '2026-09-25T00:00:00Z'),
          tokenTransfer(WALLET, EXCHANGE, '1', 410, '2026-09-26T00:00:00Z'),
        ],
      }),
      'evm',
    );
    firstScanId = first.scanId!;
    // Harga saat transaksi baru diketahui untuk dua transfer masuk.
    await db.update(schema.nativeTransfers).set({ amountUsd: '24500.10' }).where(eq(schema.nativeTransfers.blockNumber, 100));
    await db.update(schema.nativeTransfers).set({ amountUsd: '4900.05' }).where(eq(schema.nativeTransfers.blockNumber, 200));
    // Pemindaian berikutnya gagal total: ringkasan tetap memakai pemindaian yang berhasil.
    await ingestion.persist(
      collection({
        fetchedAt: new Date('2026-10-03T04:45:00Z'),
        runs: [run('chain.head'), run('address.native_transfers', 'unavailable')],
        scan: {
          blockFrom: 1_050,
          blockTo: 1_050,
          windowFrom: new Date('2026-10-03T04:45:00Z'),
          windowTo: new Date('2026-10-03T04:45:00Z'),
          nativeScanned: false,
          tokensScanned: false,
          internalScanned: false,
          status: 'unavailable',
          statusReason: 'Transfer native, transfer internal, transfer token: HTTP 503.',
          missingFields: ['native_transfers', 'internal_transfers', 'token_transfers'],
        },
        failure: 'Semua sumber riwayat transfer gagal dibaca',
      }),
      'evm',
    );
    await db.insert(schema.addresses).values({ chainId: 'robinhood', address: NEVER_SCANNED, addressNormalized: NEVER_SCANNED });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  const url = (address: string, query = '', chain = 'robinhood') => `/api/flows/${chain}/${address}/summary${query}`;

  it('meringkas masuk dan keluar per aset dengan presisi penuh', async () => {
    const { body } = await request(app.getHttpServer()).get(url(WALLET.toLowerCase())).expect(200);
    expect(body).toMatchObject({
      chain: { id: 'robinhood', nativeSymbol: 'ETH' },
      address: WALLET,
      scan: { id: firstScanId, blockFrom: 0, blockTo: 1_000, collectedStatus: 'complete', dataStatus: 'complete' },
      window: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-03T04:30:00.000Z', clipped: false },
      dataStatus: 'complete',
    });
    const [eth, nbla] = body.assets;
    expect(eth).toEqual({
      asset: { type: 'native', symbol: 'ETH', decimals: 18 },
      in: { transferCount: 3, amountRaw: '12000000000000000123', amount: '12.000000000000000123', amountUsd: 29400.15, unpricedCount: 1 },
      out: { transferCount: 2, amountRaw: '3000000000000000000', amount: '3', amountUsd: null, unpricedCount: 2 },
      netRaw: '9000000000000000123',
      net: '9.000000000000000123',
    });
    expect(nbla).toMatchObject({
      asset: { type: 'token', address: TOKEN, symbol: 'NBLA', decimals: 18 },
      in: { transferCount: 1, amountRaw: '123456789012345678901234567890' },
      out: { transferCount: 1, amountRaw: '1' },
      netRaw: '123456789012345678901234567889',
    });
  });

  it('menghitung lawan transaksi unik, mengecualikan transfer ke diri sendiri, dan jujur soal USD', async () => {
    const { body } = await request(app.getHttpServer()).get(url(WALLET)).expect(200);
    expect(body.totals).toEqual({
      in: { transferCount: 4, counterpartyCount: 3 },
      out: { transferCount: 3, counterpartyCount: 3 },
      counterpartyCount: 4,
      selfTransferCount: 1,
      usd: {
        inUsd: 29400.15,
        outUsd: null,
        // Ada transfer tanpa harga: selisih USD tidak dihitung.
        netUsd: null,
        pricedCount: 2,
        unpricedCount: 5,
        classification: 'derived_metric',
      },
    });
  });

  it('melaporkan percobaan pemindaian yang gagal setelah pemindaian yang dipakai', async () => {
    const { body } = await request(app.getHttpServer()).get(url(WALLET)).expect(200);
    expect(body.lastFailedAttempt).toEqual({
      scannedAt: '2026-10-03T04:45:00.000Z',
      status: 'unavailable',
      statusReason: 'Transfer native, transfer internal, transfer token: HTTP 503.',
    });
  });

  it('mempersempit rentang dengan from/to dan menandai bila permintaan melewati cakupan', async () => {
    const { body } = await request(app.getHttpServer())
      .get(url(WALLET, '?from=2026-08-01T00:00:00Z&to=2026-09-21T00:30:00Z'))
      .expect(200);
    expect(body.window).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-21T00:30:00.000Z', clipped: true, preset: null });
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0]).toMatchObject({ in: { transferCount: 2, amount: '12' }, out: { transferCount: 1, amount: '2' } });
  });

  it('preset rentang dihitung mundur dari akhir cakupan', async () => {
    // Cakupan berakhir 2026-10-03T04:30Z: 30 hari ke belakang mulai 2026-09-03T04:30Z.
    const { body } = await request(app.getHttpServer()).get(url(WALLET, '?range=30d')).expect(200);
    expect(body.window).toEqual({ from: '2026-09-03T04:30:00.000Z', to: '2026-10-03T04:30:00.000Z', clipped: false, preset: '30d' });
    // Transfer dari exchange (10 Sep) masih masuk; tidak ada yang sebelum 3 Sep.
    expect(body.assets[0].in.transferCount).toBe(3);
    const day = await request(app.getHttpServer()).get(url(WALLET, '?range=24h')).expect(200);
    expect(day.body).toMatchObject({ window: { preset: '24h' }, totals: { in: { transferCount: 0 }, out: { transferCount: 0 } }, assets: [] });
  });

  it('rentang di luar cakupan: total tidak diketahui, bukan nol', async () => {
    const { body } = await request(app.getHttpServer()).get(url(WALLET, '?from=2026-10-10T00:00:00Z')).expect(200);
    expect(body).toMatchObject({ window: null, totals: null, assets: [] });
  });

  it('memilih pemindaian lewat scan atau at; sebelum pemindaian pertama tidak ada data', async () => {
    await request(app.getHttpServer()).get(url(WALLET, `?scan=${firstScanId}`)).expect(200);
    const before = await request(app.getHttpServer()).get(url(WALLET, '?at=2026-10-01T00:00:00Z')).expect(200);
    expect(before.body).toMatchObject({ scan: null, window: null, totals: null, dataStatus: 'unavailable', lastFailedAttempt: null });
    await request(app.getHttpServer()).get(url(WALLET, '?scan=999999')).expect(404);
  });

  it('address yang tercatat tapi belum pernah dipindai: tidak tersedia, total tidak diketahui', async () => {
    const { body } = await request(app.getHttpServer()).get(url(NEVER_SCANNED)).expect(200);
    expect(body).toMatchObject({ scan: null, totals: null, assets: [], dataStatus: 'unavailable' });
  });

  it('pemindaian lama dianggap basi', async () => {
    now = new Date('2026-10-04T12:00:00Z');
    const { body } = await request(app.getHttpServer()).get(url(WALLET)).expect(200);
    expect(body.scan).toMatchObject({ collectedStatus: 'complete', dataStatus: 'stale' });
    expect(body.dataStatus).toBe('stale');
    now = new Date('2026-10-03T05:00:00Z');
  });

  it('menolak masukan yang salah dengan pesan jelas', async () => {
    const server = app.getHttpServer();
    expect((await request(server).get(url('0x1234')).expect(400)).body.message).toMatch(/address/i);
    expect((await request(server).get(url(WALLET, '', 'mars')).expect(404)).body.message).toContain('mars');
    expect((await request(server).get(url('0x' + '99'.repeat(20))).expect(404)).body.message).toContain('belum pernah dipindai');
    await request(server).get(url(WALLET, '?from=kemarin')).expect(400);
    await request(server).get(url(WALLET, '?scan=abc')).expect(400);
    await request(server).get(url(WALLET, '?from=2026-09-10T00:00:00Z&to=2026-09-01T00:00:00Z')).expect(400);
    await request(server).get(url(WALLET, '?range=1y')).expect(400);
    expect((await request(server).get(url(WALLET, '?range=7d&from=2026-09-10T00:00:00Z')).expect(400)).body.message).toContain('range');
  });
});
