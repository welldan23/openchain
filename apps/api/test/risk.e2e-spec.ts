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
import { createTestDatabase, seedContractChecks, seedToken, testTxHash, type TestDatabase } from './support/database.js';

const TOKEN = '0x' + 'ab'.repeat(20);
const WALLET = '0x' + 'c1'.repeat(20);
const NOW = new Date('2026-10-03T05:00:00Z');
const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };

function scan(chainId: string, blockTo: number): AddressFlowCollection {
  const at = new Date('2026-10-03T04:00:00Z');
  return {
    chainId,
    address: WALLET,
    fetchedAt: at,
    runs: [],
    head: { blockNumber: blockTo, timestamp: at },
    nativeTransfers: [
      { txHash: testTxHash(`masuk-${blockTo}`), kind: 'transaction', tracePath: '', from: '0x' + 'f1'.repeat(20), to: WALLET, amountRaw: '1', blockNumber: blockTo - 10, timestamp: new Date('2026-09-20T00:00:00Z') },
    ],
    tokenTransfers: [],
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo,
      windowFrom: new Date('2026-09-01T00:00:00Z'),
      windowTo: at,
      nativeScanned: true,
      tokensScanned: true,
      internalScanned: true,
      status: 'complete',
      statusReason: null,
      missingFields: [],
    },
    partyLabels: [],
    failure: null,
  };
}

describe('/api/risk', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let ingestion: FundFlowIngestionService;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const { snapshots } = await seedToken(db, { address: TOKEN });
    await seedContractChecks(db, 'robinhood', snapshots[1].id);
    ingestion = new FundFlowIngestionService(db as unknown as Database);
    await ingestion.persist(scan('ethereum', 1_000), 'evm');
    await db.insert(schema.addresses).values({ chainId: 'base', address: WALLET, addressNormalized: WALLET });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => NOW })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it('token: ringkasan skor, asal poin, hitungan, snapshot, dan tautan; dinilai otomatis saat pertama dibuka', async () => {
    const { body } = await request(app.getHttpServer()).get(`/api/risk/robinhood/${TOKEN}`).expect(200);
    expect(body).toMatchObject({
      status: 'assessed',
      chain: 'robinhood',
      objectKind: 'token',
      title: 'Nebula Finance (NBLA)',
      methodology: 'openchain-risk-v1',
      score: 33,
      level: 'medium',
      breakdown: {
        parts: [
          { classification: 'verified_fact', points: 25, reasonCount: 2 },
          { classification: 'derived_metric', points: 8, reasonCount: 1 },
        ],
        countedPoints: 33,
        uncounted: 0,
        unexplained: 0,
      },
      counts: { reasons: 3, warnings: 0, traits: { detected: 2 } },
      latestWarning: null,
      snapshot: { blockNumber: 23512880, sources: ['blockscout', 'robinhood-rpc'], dataStatus: 'partial', assessedAt: NOW.toISOString() },
      newerDataAvailable: false,
      links: [{ kind: 'token', href: `/token/robinhood/${TOKEN}` }],
    });
    expect(body.topReasons.map((reason: { code: string }) => reason.code)).toEqual(['check_tax', 'holder_concentration', 'check_ownership']);
    expect(body.snapshot.statusReason).toContain('holders.labels');
    // Membuka lagi memakai penilaian yang sama, bukan menilai ulang.
    const again = await request(app.getHttpServer()).get(`/api/risk/robinhood/${TOKEN}`).expect(200);
    expect(again.body.assessmentId).toBe(body.assessmentId);
    expect(await db.select().from(schema.riskAssessments)).toHaveLength(1);
  });

  it('wallet multichain: chain tanpa pemindaian dilaporkan tanpa data; data baru ditandai dan bisa dinilai ulang', async () => {
    const server = app.getHttpServer();
    const { body } = await request(server).get(`/api/risk/${WALLET}`).expect(200);
    expect(body.chains.map((item: { chain: string; status: string }) => [item.chain, item.status])).toEqual([
      ['base', 'no_data'],
      ['ethereum', 'assessed'],
    ]);
    expect(body.chains[0].reason).toContain('belum dipindai');
    expect(body.chains[1]).toMatchObject({ objectKind: 'wallet', score: 0, level: 'low', snapshot: { blockNumber: 1_000 }, newerDataAvailable: false });
    expect(body.highest).toEqual({ chain: 'ethereum', score: 0, level: 'low' });
    expect(body.caveats.join(' ')).toContain('bukan berarti aman');

    // Pemindaian baru: penilaian lama ditandai, lalu dinilai ulang dengan refresh.
    await ingestion.persist(scan('ethereum', 2_000), 'evm');
    const stale = await request(server).get(`/api/risk/ethereum/${WALLET}`).expect(200);
    expect(stale.body).toMatchObject({ snapshot: { blockNumber: 1_000 }, newerDataAvailable: true });
    const refreshed = await request(server).get(`/api/risk/ethereum/${WALLET}?refresh=true`).expect(200);
    expect(refreshed.body).toMatchObject({ snapshot: { blockNumber: 2_000 }, newerDataAvailable: false });
    const wallets = await db.select().from(schema.riskAssessments).where(eq(schema.riskAssessments.objectKind, 'wallet'));
    expect(wallets.map((row) => row.blockNumber).sort()).toEqual([1_000, 2_000]);
  });

  it('galat: chain tak dikenal 400, address rusak 400, belum tercatat atau tanpa data 404, refresh salah 400', async () => {
    const server = app.getHttpServer();
    await request(server).get(`/api/risk/mars/${WALLET}`).expect(400);
    await request(server).get('/api/risk/ethereum/0x1234').expect(400);
    await request(server).get(`/api/risk/ethereum/0x${'99'.repeat(20)}`).expect(404);
    const noData = await request(server).get(`/api/risk/base/${WALLET}`).expect(404);
    expect(noData.body.message).toContain('belum dipindai');
    await request(server).get(`/api/risk/ethereum/${WALLET}?refresh=ya`).expect(400);
  });
});
