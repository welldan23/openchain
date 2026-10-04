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
import { buildEvidenceKey } from '../src/database/identifiers.js';
import * as schema from '../src/database/schema/index.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import type { ProviderRunRecord } from '../src/providers/provider.types.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const WALLET = '0x7E5bF5e0E4897549C5d1B4D22BfE8Ad1A50B7DC8';
const ROUTER = '0x' + 'a0'.repeat(20);
const POOL = '0x' + 'b0'.repeat(20);
const TOKEN = '0x' + '70'.repeat(20);
const TX = '0x' + 'AB'.repeat(32);
const OTHER_TX = '0x' + 'cd'.repeat(32);
const FETCHED_AT = new Date('2026-10-03T04:30:00Z');
const BLOCK_TIME = new Date('2026-09-12T08:31:00Z');

const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };
const run = (operation: string): ProviderRunRecord => ({
  key: operation,
  provider: 'blockscout',
  kind: 'indexed_data',
  operation,
  subject: WALLET,
  status: 'complete',
  errorReason: null,
  missingFields: [],
  blockFrom: 0,
  blockTo: 900,
  startedAt: FETCHED_AT,
  fetchedAt: FETCHED_AT,
});
const token = (logIndex: number, from: string, to: string, amountRaw: string) => ({
  txHash: TX,
  logIndex,
  token: { address: TOKEN, symbol: 'NBLA', name: 'Nebula Finance', decimals: 18 },
  from,
  to,
  amountRaw,
  blockNumber: 812,
  timestamp: BLOCK_TIME,
});

function collection(): AddressFlowCollection {
  return {
    chainId: 'robinhood',
    address: WALLET,
    fetchedAt: FETCHED_AT,
    runs: [run('address.native_transfers'), run('address.internal_transfers'), run('address.token_transfers')],
    head: { blockNumber: 900, timestamp: FETCHED_AT },
    nativeTransfers: [
      { txHash: TX, kind: 'internal', tracePath: '10', from: ROUTER, to: WALLET, amountRaw: '3', blockNumber: 812, timestamp: BLOCK_TIME },
      { txHash: TX, kind: 'transaction', tracePath: '', from: WALLET, to: ROUTER, amountRaw: '2000000000000000000', blockNumber: 812, timestamp: BLOCK_TIME },
      { txHash: TX, kind: 'internal', tracePath: '2', from: ROUTER, to: POOL, amountRaw: '1999999999999999997', blockNumber: 812, timestamp: BLOCK_TIME },
    ],
    tokenTransfers: [token(7, POOL, WALLET, '51000000000000000000000000'), token(3, POOL, ROUTER, '5')],
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 900,
      windowFrom: new Date('2026-09-01T00:00:00Z'),
      windowTo: FETCHED_AT,
      nativeScanned: true,
      tokensScanned: true,
      internalScanned: true,
      status: 'complete',
      statusReason: null,
      missingFields: [],
    },
    failure: null,
  };
}

describe('GET /api/transactions/:chain/:hash', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    await new FundFlowIngestionService(db as unknown as Database).persist(collection(), 'evm');
    const [router] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, ROUTER));
    const [pool] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, POOL));
    await db.insert(schema.labels).values({
      addressId: router.id,
      labelType: 'router',
      name: 'Uniswap V2: Router',
      source: 'external',
      sourceName: 'Blockscout',
      classification: 'external_label',
    });
    const txHash = TX.toLowerCase();
    await db.insert(schema.evidence).values({
      evidenceKey: buildEvidenceKey({ chainId: 'robinhood', classification: 'verified_fact', txHash, logIndex: 7, subject: 'nbla-bundler-buy' }),
      chainId: 'robinhood',
      classification: 'verified_fact',
      explanation: 'Wallet membeli NBLA di blok yang sama dengan penambahan likuiditas.',
      txHash,
      blockNumber: 812,
      blockTimestamp: BLOCK_TIME,
      logIndex: 7,
      sourceAddressId: pool.id,
      asset: 'NBLA',
      amountRaw: '51000000000000000000000000',
      fetchedAt: FETCHED_AT,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date('2026-10-03T05:00:00Z') })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  const url = (hash: string, chain = 'robinhood') => `/api/transactions/${chain}/${hash}`;

  it('mengembalikan semua perpindahan dana dalam transaksi, urut nilai, internal, lalu token', async () => {
    const { body } = await request(app.getHttpServer()).get(url(TX)).expect(200);
    expect(body).toMatchObject({
      chain: { id: 'robinhood', nativeSymbol: 'ETH' },
      txHash: TX.toLowerCase(),
      explorerUrl: `https://robinhoodchain.blockscout.com/tx/${TX.toLowerCase()}`,
      blockNumber: 812,
      timestamp: BLOCK_TIME.toISOString(),
      transaction: null,
    });
    expect(body.movements.map((move: { transferKind: string; position: string }) => [move.transferKind, move.position])).toEqual([
      ['native', ''],
      ['internal', '2'],
      ['internal', '10'],
      ['token', '3'],
      ['token', '7'],
    ]);
    expect(body.movements[0]).toMatchObject({
      index: 0,
      from: { address: WALLET },
      to: { address: ROUTER, labels: [{ type: 'router', name: 'Uniswap V2: Router', source: 'external' }] },
      asset: { type: 'native', symbol: 'ETH', decimals: 18 },
      amount: '2',
      amountUsd: null,
      classification: 'verified_fact',
    });
    expect(body.movements[4]).toMatchObject({
      asset: { type: 'token', address: TOKEN, symbol: 'NBLA' },
      amountRaw: '51000000000000000000000000',
      amount: '51000000',
    });
  });

  it('menampilkan klaim yang memakai transaksi ini dan sumber datanya', async () => {
    const { body } = await request(app.getHttpServer()).get(url(TX.toLowerCase())).expect(200);
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0]).toMatchObject({
      classification: 'verified_fact',
      explanation: expect.stringContaining('membeli NBLA'),
      logIndex: 7,
      sourceAddress: POOL,
      explorerUrl: `https://robinhoodchain.blockscout.com/tx/${TX.toLowerCase()}`,
    });
    expect(body.sources.map((source: { operation: string }) => source.operation).sort()).toEqual([
      'address.internal_transfers',
      'address.native_transfers',
      'address.token_transfers',
    ]);
  });

  it('transaksi yang detailnya tercatat tanpa perpindahan dana tetap dijawab, dengan daftar kosong', async () => {
    const detailOnly = '0x' + 'ef'.repeat(32);
    const [wallet] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, WALLET.toLowerCase()));
    await db.insert(schema.transactions).values({
      chainId: 'robinhood',
      hash: detailOnly,
      blockNumber: 500,
      blockTimestamp: new Date('2026-09-10T00:00:00Z'),
      fromAddressId: wallet.id,
      method: 'approve',
      success: true,
      valueRaw: '0',
      fetchedAt: FETCHED_AT,
    });
    const { body } = await request(app.getHttpServer()).get(url(detailOnly)).expect(200);
    expect(body).toMatchObject({
      blockNumber: 500,
      transaction: { from: WALLET, to: null, method: 'approve', success: true, valueRaw: '0' },
      movements: [],
      claims: [],
      sources: [],
    });
  });

  it('transaksi yang belum tercatat: 404 dengan alasan, tidak dikarang', async () => {
    const { body } = await request(app.getHttpServer()).get(url(OTHER_TX)).expect(404);
    expect(body.message).toContain('belum tercatat');
  });

  it('menolak hash yang salah format dan chain yang tidak dikenal', async () => {
    await request(app.getHttpServer()).get(url('0x1234')).expect(400);
    await request(app.getHttpServer()).get(url(TX, 'mars')).expect(404);
  });
});
