import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import { createTestDatabase, seedContractChecks, seedToken, testTxHash, type TestDatabase } from './support/database.js';

const TOKEN = '0x' + 'ab'.repeat(20);

const WALLET = '0x' + 'c1'.repeat(20);
const FUNDER = '0x' + 'f1'.repeat(20);
const TX = `0x${'7d'.repeat(32)}`;
const MISSING_TX = `0x${'9e'.repeat(32)}`;
const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };

function scanOf(chainId: string, address: string, scannedAt: Date): AddressFlowCollection {
  const at = new Date('2026-10-01T00:00:00Z');
  return {
    chainId,
    address,
    fetchedAt: scannedAt,
    runs: [],
    head: { blockNumber: 1_000, timestamp: scannedAt },
    nativeTransfers: [{ txHash: TX, kind: 'transaction', tracePath: '', from: FUNDER, to: address, amountRaw: '5000000000000000000', blockNumber: 700, timestamp: at }],
    tokenTransfers: [],
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 1_000,
      windowFrom: at,
      windowTo: scannedAt,
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

describe('/api/reports/:id/picker dan compose', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');
  let snapshotId: number;
  let reportId: string;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const { snapshots } = await seedToken(db, { address: TOKEN });
    snapshotId = snapshots[1].id;
    await seedContractChecks(db, 'robinhood', snapshotId);
    await new FundFlowIngestionService(db as unknown as Database).persist(scanOf('ethereum', WALLET, new Date('2026-10-03T04:00:00Z')), 'evm');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/cases')
      .send({
        title: 'Token NBLA',
        subject: { kind: 'token', chain: 'robinhood', address: TOKEN, title: 'NBLA', href: `/token/robinhood/${TOKEN}` },
        findings: [{ id: 'kelompok-a', title: 'Pendana bersama', detail: '3 wallet', classification: 'heuristic', evidenceTxHashes: [MISSING_TX] }],
      })
      .expect(201);
    await request(server)
      .post(`/api/cases/${created.body.caseId}/items`)
      .send({ subject: { kind: 'address', address: WALLET, title: 'Pendana', href: `/multichain/${WALLET}` } })
      .expect(200);
    const report = await request(server)
      .post('/api/reports')
      .send({ title: 'Laporan NBLA', caseId: created.body.caseId, sections: [{ title: 'Ringkasan', blocks: [{ kind: 'paragraph', text: 'Ringkas.' }] }, { title: 'Kesimpulan' }] })
      .expect(201);
    reportId = report.body.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it('picker: subjek dan temuan kasus, serta temuan risiko tiap entitas per chain', async () => {
    const { body } = await request(app.getHttpServer()).get(`/api/reports/${reportId}/picker`).expect(200);
    expect(body).toMatchObject({ reportId, status: 'draft', source: { title: 'Token NBLA' } });
    expect(body.subjects.map((item: { key: string; inReport: boolean }) => [item.key, item.inReport])).toEqual([
      [`token:robinhood:${TOKEN}`, false],
      [`address:multichain:${WALLET}`, false],
    ]);
    expect(body.findings).toEqual([
      { key: 'case:kelompok-a', title: 'Pendana bersama', detail: '3 wallet', classification: 'heuristic', inReport: false, evidenceCount: 1, storedCount: 0 },
    ]);
    const token = body.analyzed.find((item: { chain: string }) => item.chain === 'robinhood');
    expect(token).toMatchObject({ status: 'assessed', objectKind: 'token', score: 33, level: 'medium', methodology: 'openchain-risk-v1' });
    expect(token.findings.map((item: { key: string; points: number }) => [item.key, item.points])).toEqual([
      [`risk:robinhood:${TOKEN}:reason:check_tax`, 20],
      [`risk:robinhood:${TOKEN}:reason:holder_concentration`, 8],
      [`risk:robinhood:${TOKEN}:reason:check_ownership`, 5],
    ]);
    // Subjek multichain dinilai di tiap chain tempat address-nya tercatat.
    const wallet = body.analyzed.filter((item: { subjectKey: string }) => item.subjectKey === `address:multichain:${WALLET}`);
    expect(wallet.map((item: { chain: string; status: string; score: number }) => [item.chain, item.status, item.score])).toEqual([['ethereum', 'assessed', 0]]);
    expect(body.caveats.join(' ')).toContain('bisa keliru');
  });

  it('compose: entitas dan klaim masuk bagian yang tepat dengan provider dan waktu data; pilihan ulang dilewati', async () => {
    const server = app.getHttpServer();
    now = new Date('2026-10-03T05:10:00Z');
    const keys = { subjects: [`token:robinhood:${TOKEN}`], findings: ['case:kelompok-a', `risk:robinhood:${TOKEN}:reason:check_tax`] };
    const { body } = await request(server).post(`/api/reports/${reportId}/compose`).send(keys).expect(200);
    expect(body).toMatchObject({ addedSubjects: 1, addedFindings: 2, skipped: [] });
    expect(body.addedBlockIds).toHaveLength(3);
    expect(body.report.updatedAt).toBe(now.toISOString());
    expect(body.report.sections.map((section: { title: string }) => section.title)).toEqual(['Ringkasan', 'Entitas yang diselidiki', 'Temuan', 'Kesimpulan']);
    const [entity] = body.report.sections[1].blocks;
    expect(entity).toMatchObject({ kind: 'entity', sourceKey: `subject:token:robinhood:${TOKEN}`, subject: { kind: 'token', chain: 'robinhood', title: 'NBLA' } });
    const [caseClaim, riskClaim] = body.report.sections[2].blocks.map((block: { claim: object }) => block.claim);
    expect(caseClaim).toMatchObject({
      sourceKey: 'case:kelompok-a',
      classification: 'heuristic',
      provider: expect.stringMatching(/^OpenChain heuristic/),
      evidence: [{ chain: 'robinhood', txHash: MISSING_TX }],
    });
    expect(riskClaim).toMatchObject({
      sourceKey: `risk:robinhood:${TOKEN}:reason:check_tax`,
      title: 'NBLA: Pajak transaksi berisiko',
      classification: 'verified_fact',
      provider: 'blockscout, robinhood-rpc',
      observedAt: '2026-10-03T04:30:00.000Z',
      evidence: [{ chain: 'robinhood', txHash: testTxHash(`tax-${snapshotId}`) }],
    });
    expect(riskClaim.detail).toContain('Menyumbang 20 poin ke skor 33');

    const again = await request(server).post(`/api/reports/${reportId}/compose`).send(keys).expect(200);
    expect(again.body).toMatchObject({ addedSubjects: 0, addedFindings: 0, addedBlockIds: [], skipped: [...keys.subjects, ...keys.findings] });
    const picker = await request(server).get(`/api/reports/${reportId}/picker`).expect(200);
    expect(picker.body.subjects[0].inReport).toBe(true);
    expect(picker.body.findings[0].inReport).toBe(true);
    expect(picker.body.analyzed.find((item: { chain: string }) => item.chain === 'robinhood').findings[0].inReport).toBe(true);
  });

  it('galat: kunci tak dikenal 400, isi kosong 400, laporan tak ada 404, laporan final 409', async () => {
    const server = app.getHttpServer();
    await request(server).post(`/api/reports/${reportId}/compose`).send({ findings: ['case:tidak-ada'] }).expect(400);
    await request(server).post(`/api/reports/${reportId}/compose`).send({}).expect(400);
    await request(server).get('/api/reports/999/picker').expect(404);
    await request(server).post('/api/reports/999/compose').send({ findings: ['case:x'] }).expect(404);

    const blank = await request(server).post('/api/reports').send({ title: 'Kosong' }).expect(201);
    const picker = await request(server).get(`/api/reports/${blank.body.id}/picker`).expect(200);
    expect(picker.body).toMatchObject({ source: null, subjects: [], findings: [], analyzed: [] });
    expect(picker.body.caveats.join(' ')).toContain('tidak punya kasus sumber');
    await request(server).patch(`/api/reports/${blank.body.id}`).send({ status: 'final' }).expect(200);
    await request(server).post(`/api/reports/${blank.body.id}/compose`).send({ findings: ['case:x'] }).expect(409);
  });
});
