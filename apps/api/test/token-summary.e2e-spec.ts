import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE } from '../src/database/database.module.js';
import { createTestDatabase, seedToken, type TestDatabase } from './support/database.js';

const TOKEN = '0x86C8862bA06BEFeEd8bC12d165A430166395D5a3';
const DEPLOYER = '0x' + 'De'.repeat(20);
const EMPTY_TOKEN = '0x' + 'E1'.repeat(20);
const FETCHED_AT = new Date('2026-10-03T04:30:00Z');

describe('GET /api/tokens/:chain/:address/summary', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    await seedToken(db, { address: TOKEN, deployer: DEPLOYER, fetchedAt: FETCHED_AT });
    await seedToken(db, { address: EMPTY_TOKEN, symbol: 'SUNY', withSnapshot: false });

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

  const summaryUrl = (chain: string, address: string) => `/api/tokens/${chain}/${address}/summary`;

  it('mengembalikan ringkasan token dari snapshot terbaru', async () => {
    const response = await request(app.getHttpServer()).get(summaryUrl('robinhood', TOKEN)).expect(200);
    expect(response.body).toMatchObject({
      chain: { id: 'robinhood', name: 'Robinhood Chain', family: 'evm', supportStatus: 'planned' },
      token: {
        address: TOKEN,
        symbol: 'NBLA',
        decimals: 18,
        totalSupply: '1000000000',
        totalSupplyRaw: '1000000000000000000000000000',
        deployer: DEPLOYER,
        sourceVerified: true,
      },
      snapshot: {
        blockNumber: 23512880,
        fetchedAt: FETCHED_AT.toISOString(),
        collectedStatus: 'partial',
        dataStatus: 'partial',
      },
      dataStatus: 'partial',
      market: { priceUsd: 0.004213, liquidityUsd: 612400, holderCount: 3482 },
      concentration: { top10Pct: 61.8, top50Pct: 78.3 },
      risk: { score: 68, level: 'high' },
    });
    expect(response.body.snapshot.sources.map((source: { provider: string }) => source.provider)).toEqual([
      'robinhood-rpc',
      'blockscout',
    ]);
    expect(response.body.snapshot.sources[1]).toMatchObject({
      status: 'partial',
      missingFields: ['holders.labels'],
    });
  });

  it('tidak membedakan huruf besar-kecil address EVM', async () => {
    const response = await request(app.getHttpServer())
      .get(summaryUrl('robinhood', TOKEN.toLowerCase()))
      .expect(200);
    // Identifier asli tetap dikembalikan apa adanya.
    expect(response.body.token.address).toBe(TOKEN);
  });

  it('bisa membuka snapshot pada blok tertentu', async () => {
    const response = await request(app.getHttpServer())
      .get(`${summaryUrl('robinhood', TOKEN)}?block=23512000`)
      .expect(200);
    expect(response.body.snapshot).toMatchObject({ blockNumber: 23512000, sources: [] });
    expect(response.body.market.holderCount).toBe(3400);
  });

  it('menandai snapshot yang sudah lama sebagai stale', async () => {
    now = new Date('2026-10-03T09:00:00Z');
    const response = await request(app.getHttpServer()).get(summaryUrl('robinhood', TOKEN)).expect(200);
    now = new Date('2026-10-03T05:00:00Z');
    expect(response.body.snapshot).toMatchObject({ collectedStatus: 'partial', dataStatus: 'stale' });
    expect(response.body.dataStatus).toBe('stale');
  });

  it('melaporkan unavailable untuk token yang belum punya snapshot', async () => {
    const response = await request(app.getHttpServer())
      .get(summaryUrl('robinhood', EMPTY_TOKEN))
      .expect(200);
    expect(response.body).toMatchObject({
      snapshot: null,
      dataStatus: 'unavailable',
      market: null,
      concentration: null,
      risk: { score: null, level: 'unknown' },
    });
  });

  it('404 untuk token yang tidak ada', async () => {
    const response = await request(app.getHttpServer())
      .get(summaryUrl('robinhood', '0x' + '0'.repeat(40)))
      .expect(404);
    expect(response.body.message).toContain('tidak ditemukan');
  });

  it('404 untuk chain yang tidak dikenal', async () => {
    const response = await request(app.getHttpServer()).get(summaryUrl('dogechain', TOKEN)).expect(404);
    expect(response.body.message).toBe('Chain "dogechain" tidak dikenal.');
  });

  it('404 untuk snapshot pada blok yang tidak ada', async () => {
    await request(app.getHttpServer()).get(`${summaryUrl('robinhood', TOKEN)}?block=1`).expect(404);
  });

  it('400 untuk format address atau blok yang salah', async () => {
    const badAddress = await request(app.getHttpServer())
      .get(summaryUrl('robinhood', '0x1234'))
      .expect(400);
    expect(badAddress.body.message).toContain('tidak valid');
    await request(app.getHttpServer()).get(`${summaryUrl('robinhood', TOKEN)}?block=abc`).expect(400);
  });

  it('token di chain lain tidak ikut terbaca', async () => {
    await request(app.getHttpServer()).get(summaryUrl('ethereum', TOKEN)).expect(404);
  });
});
