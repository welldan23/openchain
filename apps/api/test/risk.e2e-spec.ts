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

function scan(chainId: string, blockTo: number, txHash = testTxHash(`masuk-${blockTo}`)): AddressFlowCollection {
  const at = new Date('2026-10-03T04:00:00Z');
  return {
    chainId,
    address: WALLET,
    fetchedAt: at,
    runs: [],
    head: { blockNumber: blockTo, timestamp: at },
    nativeTransfers: [
      { txHash, kind: 'transaction', tracePath: '', from: '0x' + 'f1'.repeat(20), to: WALLET, amountRaw: '1', blockNumber: blockTo - 10, timestamp: new Date('2026-09-20T00:00:00Z') },
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
  let snapshotId: number;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const { snapshots } = await seedToken(db, { address: TOKEN });
    snapshotId = snapshots[1].id;
    await seedContractChecks(db, 'robinhood', snapshotId);
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

  it('temuan: jenis informasi beserta artinya, bukti hash dengan status tersimpan, ciri, dan saringan', async () => {
    const server = app.getHttpServer();
    const { body } = await request(server).get(`/api/risk/robinhood/${TOKEN}/findings`).expect(200);
    expect(body).toMatchObject({ chain: 'robinhood', objectKind: 'token', score: 33, level: 'medium', total: 3, filters: { classification: [], severity: [] } });
    expect(body.findings.map((item: { id: string; kind: string }) => [item.id, item.kind])).toEqual([
      ['check_tax', 'reason'],
      ['holder_concentration', 'reason'],
      ['check_ownership', 'reason'],
    ]);
    const [tax] = body.findings;
    expect(tax).toMatchObject({
      classification: 'verified_fact',
      classificationInfo: { name: 'Fakta on-chain' },
      points: 20,
      trait: 'tax_change',
      detectedAt: null,
    });
    // Hash bukti pajak ada di catatan bukti, tapi transaksinya belum tersimpan sebagai transfer.
    expect(tax.evidence).toEqual([expect.objectContaining({ chain: 'robinhood', stored: false, explorerUrl: expect.stringContaining('/tx/0x') })]);
    expect(body.facets.classification).toEqual([
      { classification: 'verified_fact', name: 'Fakta on-chain', count: 2 },
      { classification: 'derived_metric', name: 'Kalkulasi', count: 1 },
    ]);
    expect(body.traits[0]).toMatchObject({ status: 'detected', finding: { kind: 'reason' } });
    expect(body.traits.map((item: { status: string }) => item.status)).toContain('unknown');
    expect(body.caveats.join(' ')).toContain('explorer');
    // Konsentrasi holder adalah hitungan, jadi tidak punya hash transaksi.
    expect(body.caveats.join(' ')).toContain('1 temuan tidak punya hash transaksi');

    const filtered = await request(server).get(`/api/risk/robinhood/${TOKEN}/findings?classification=derived_metric`).expect(200);
    expect(filtered.body).toMatchObject({ total: 1, findings: [{ id: 'holder_concentration' }] });
    expect(filtered.body.facets.classification.find((item: { classification: string }) => item.classification === 'verified_fact').count).toBe(2);
    await request(server).get(`/api/risk/robinhood/${TOKEN}/findings?classification=rumor`).expect(400);
    await request(server).get(`/api/risk/robinhood/${TOKEN}/findings?severity=parah`).expect(400);
    await request(server).get(`/api/risk/base/${WALLET}/findings`).expect(404);
  });

  it('rincian alasan: poin dan porsinya, ciri, catatan bukti, isi transaksi bila tersimpan, dan tetangga', async () => {
    const server = app.getHttpServer();
    const { body } = await request(server).get(`/api/risk/robinhood/${TOKEN}/reasons/check_tax`).expect(200);
    expect(body).toMatchObject({
      chain: 'robinhood',
      objectKind: 'token',
      score: 33,
      finding: { id: 'check_tax', kind: 'reason', points: 20, classification: 'verified_fact', trait: 'tax_change', classificationInfo: { name: 'Fakta on-chain' } },
      shareOfCountedPoints: 60.6,
      countedPoints: 33,
      traits: [{ trait: 'tax_change', status: 'detected', finding: { kind: 'reason', id: 'check_tax' } }],
      sources: ['blockscout', 'robinhood-rpc'],
      navigation: { previous: null, next: { kind: 'reason', id: 'holder_concentration' }, position: 1, total: 3 },
    });
    expect(body.finding).not.toHaveProperty('evidence');
    const taxHash = testTxHash(`tax-${snapshotId}`);
    // Belum tersimpan: isi transaksi kosong, catatan bukti tetap ada, dan ditunjuk ke explorer.
    expect(body.evidence).toEqual([
      expect.objectContaining({ chain: 'robinhood', txHash: taxHash, stored: false, transaction: null, explorerUrl: expect.stringContaining(`/tx/${taxHash}`) }),
    ]);
    expect(body.evidence[0].record).toMatchObject({ classification: 'verified_fact', txHash: taxHash });
    expect(body.caveats.join(' ')).toContain('1 hash bukti belum tersimpan');

    // Setelah transaksinya tersimpan, rinciannya ikut tampil.
    await ingestion.persist(scan('robinhood', 3_000, taxHash), 'evm');
    const stored = await request(server).get(`/api/risk/robinhood/${TOKEN}/reasons/check_tax`).expect(200);
    expect(stored.body.evidence[0]).toMatchObject({ stored: true, transaction: { blockNumber: 2_990 } });
    expect(stored.body.evidence[0].transaction.movements[0]).toMatchObject({
      from: { address: '0x' + 'f1'.repeat(20), labels: [] },
      to: { address: WALLET },
      amountRaw: '1',
      classification: 'verified_fact',
    });
    expect(stored.body.caveats.join(' ')).not.toContain('belum tersimpan');

    const metric = await request(server).get(`/api/risk/robinhood/${TOKEN}/reasons/holder_concentration`).expect(200);
    expect(metric.body).toMatchObject({ evidence: [], navigation: { previous: { id: 'check_tax' }, next: { id: 'check_ownership' }, position: 2 } });
    expect(metric.body.caveats.join(' ')).toContain('tidak punya hash transaksi');

    await request(server).get(`/api/risk/robinhood/${TOKEN}/reasons/tidak_ada`).expect(404);
    await request(server).get(`/api/risk/robinhood/${TOKEN}/warnings/check_tax`).expect(404);
    await request(server).get(`/api/risk/robinhood/${TOKEN}/reasons/check_tax?refresh=ya`).expect(400);
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
