import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE } from '../src/database/database.module.js';
import { createTestDatabase, seedHolders, seedToken, type TestDatabase } from './support/database.js';

const TOKEN = '0x' + 'AB'.repeat(20);
const NO_SNAPSHOT_TOKEN = '0x' + 'CD'.repeat(20);

describe('GET /api/tokens/:chain/:address/holders', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const { snapshots } = await seedToken(db, { address: TOKEN });
    await seedHolders(db, 'robinhood', snapshots[1].id, 12);
    await seedToken(db, { address: NO_SNAPSHOT_TOKEN, withSnapshot: false });

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

  const url = (address: string, query = '') => `/api/tokens/robinhood/${address}/holders${query}`;

  it('mengembalikan konsentrasi dan 10 holder teratas secara default', async () => {
    const { body } = await request(app.getHttpServer()).get(url(TOKEN)).expect(200);
    expect(body).toMatchObject({
      token: { address: TOKEN, symbol: 'NBLA', decimals: 18 },
      snapshot: { blockNumber: 23512880, dataStatus: 'partial' },
      holderCount: 3482,
      concentration: { top10Pct: 61.8, top50Pct: 78.3, classification: 'derived_metric' },
    });
    expect(body.holders).toHaveLength(10);
    expect(body.holders.map((holder: { rank: number }) => holder.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(body.holders[0]).toMatchObject({
      rank: 1,
      address: '0x' + '01'.repeat(20),
      balanceRaw: '190000000000000000000000000',
      balance: '190000000',
      sharePct: 19,
    });
  });

  it('menyertakan label beserta sumbernya, eksternal lebih dulu', async () => {
    const { body } = await request(app.getHttpServer()).get(url(TOKEN)).expect(200);
    expect(body.holders[0].labels).toEqual([
      {
        type: 'liquidity_pool',
        name: 'Uniswap V2: NBLA/WETH',
        source: 'external',
        sourceName: 'Blockscout',
        classification: 'external_label',
        confidence: null,
      },
    ]);
    expect(body.holders[1].labels.map((label: { source: string }) => label.source)).toEqual([
      'heuristic',
      'user',
    ]);
    expect(body.holders[1].labels[0]).toMatchObject({ confidence: 0.64, classification: 'heuristic' });
    expect(body.holders[2].labels).toEqual([]);
  });

  it('mengikuti parameter limit', async () => {
    const { body } = await request(app.getHttpServer()).get(url(TOKEN, '?limit=3')).expect(200);
    expect(body.holders).toHaveLength(3);
    const all = await request(app.getHttpServer()).get(url(TOKEN, '?limit=100')).expect(200);
    expect(all.body.holders).toHaveLength(12);
  });

  it('menolak limit di luar 1 sampai 100', async () => {
    for (const limit of ['0', '101', 'abc', '-5']) {
      const { body } = await request(app.getHttpServer()).get(url(TOKEN, `?limit=${limit}`)).expect(400);
      expect(body.message).toBe('Parameter limit harus angka 1 sampai 100.');
    }
  });

  it('snapshot lama tanpa data holder mengembalikan daftar kosong', async () => {
    const { body } = await request(app.getHttpServer()).get(url(TOKEN, '?block=23512000')).expect(200);
    expect(body).toMatchObject({ snapshot: { blockNumber: 23512000 }, holderCount: 3400, holders: [] });
  });

  it('melaporkan unavailable untuk token tanpa snapshot', async () => {
    const { body } = await request(app.getHttpServer()).get(url(NO_SNAPSHOT_TOKEN)).expect(200);
    expect(body).toMatchObject({
      snapshot: null,
      dataStatus: 'unavailable',
      holderCount: null,
      concentration: null,
      holders: [],
    });
  });
});
