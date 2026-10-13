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
import { createTestDatabase, type TestDatabase } from './support/database.js';

const WALLET = '0x' + 'c1'.repeat(20);
const FUNDER = '0x' + 'f1'.repeat(20);
const TX = `0x${'7d'.repeat(32)}`;
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

describe('/api/reports/:id/notes', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');
  const tick = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));
  let reportId: string;
  let claimId: string;
  let otherClaimId: string;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    await new FundFlowIngestionService(db as unknown as Database).persist(scanOf('ethereum', WALLET, new Date('2026-10-03T04:00:00Z')), 'evm');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    const claim = (title: string) => ({ kind: 'claim', claim: { title, classification: 'heuristic', evidence: [{ chain: 'ethereum', txHash: TX }] } });
    const { body } = await request(app.getHttpServer())
      .post('/api/reports')
      .send({ title: 'Laporan catatan', sections: [{ title: 'Temuan', blocks: [claim('Pendana bersama'), claim('Pembeli serempak')] }, { title: 'Batasan' }] })
      .expect(201);
    reportId = body.id;
    [claimId, otherClaimId] = body.sections[0].blocks.map((block: { id: string }) => block.id);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it('tambah: masuk bagian catatan sebelum Batasan, boleh dikaitkan ke klaim', async () => {
    const server = app.getHttpServer();
    tick(1);
    const first = await request(server).post(`/api/reports/${reportId}/notes`).send({ body: ' Cek label exchange ', claimBlockId: claimId }).expect(201);
    expect(first.body.note).toMatchObject({ body: 'Cek label exchange', createdAt: now.toISOString(), editedAt: null, sectionTitle: 'Catatan investigasi', claim: { blockId: claimId, title: 'Pendana bersama' } });
    expect(first.body.report.sections.map((section: { title: string }) => section.title)).toEqual(['Temuan', 'Catatan investigasi', 'Batasan']);
    expect(first.body.report.updatedAt).toBe(now.toISOString());
    tick(1);
    await request(server).post(`/api/reports/${reportId}/notes`).send({ body: 'Catatan umum' }).expect(201);

    const { body } = await request(server).get(`/api/reports/${reportId}/notes`).expect(200);
    expect(body.notes.map((note: { body: string; claim: unknown }) => [note.body, note.claim])).toEqual([
      ['Cek label exchange', { blockId: claimId, title: 'Pendana bersama' }],
      ['Catatan umum', null],
    ]);
    expect(body.claimOptions).toEqual([
      { blockId: claimId, title: 'Pendana bersama' },
      { blockId: otherClaimId, title: 'Pembeli serempak' },
    ]);
  });

  it('ubah: isi dan kaitan berubah dengan waktu ubah, waktu dibuat tetap; tanpa perubahan tidak ditandai', async () => {
    const server = app.getHttpServer();
    const [note] = (await request(server).get(`/api/reports/${reportId}/notes`).expect(200)).body.notes;
    tick(5);
    const same = await request(server).patch(`/api/reports/${reportId}/notes/${note.id}`).send({ body: note.body }).expect(200);
    expect(same.body.note.editedAt).toBeNull();
    const moved = await request(server).patch(`/api/reports/${reportId}/notes/${note.id}`).send({ body: 'Label sudah dicek', claimBlockId: otherClaimId }).expect(200);
    expect(moved.body.note).toMatchObject({ id: note.id, body: 'Label sudah dicek', createdAt: note.createdAt, editedAt: now.toISOString(), claim: { blockId: otherClaimId } });
    const unlinked = await request(server).patch(`/api/reports/${reportId}/notes/${note.id}`).send({ claimBlockId: null }).expect(200);
    expect(unlinked.body.note.claim).toBeNull();
  });

  it('galat dan hapus: klaim bukan dari laporan ini 400, catatan terlalu panjang 400, bukan catatan 404, final 409', async () => {
    const server = app.getHttpServer();
    const [note, general] = (await request(server).get(`/api/reports/${reportId}/notes`).expect(200)).body.notes;
    await request(server).post(`/api/reports/${reportId}/notes`).send({ body: 'x', claimBlockId: note.id }).expect(400);
    await request(server).post(`/api/reports/${reportId}/notes`).send({ body: 'x', claimBlockId: 99999 }).expect(400);
    await request(server).post(`/api/reports/${reportId}/notes`).send({ body: 'x'.repeat(281) }).expect(400);
    await request(server).patch(`/api/reports/${reportId}/notes/${claimId}`).send({ body: 'bukan catatan' }).expect(404);
    await request(server).get('/api/reports/999/notes').expect(404);

    await request(server).delete(`/api/reports/${reportId}/notes/${general.id}`).expect(204);
    await request(server).delete(`/api/reports/${reportId}/notes/${general.id}`).expect(404);
    // Klaim yang dibahas dihapus: catatannya tetap ada tanpa kaitan.
    await request(server).patch(`/api/reports/${reportId}/notes/${note.id}`).send({ claimBlockId: claimId }).expect(200);
    const report = (await request(server).get(`/api/reports/${reportId}`).expect(200)).body;
    const sections = report.sections.map((section: { blocks: Array<{ id: string }> }) => ({ ...section, blocks: section.blocks.filter((block) => block.id !== claimId) }));
    await request(server).patch(`/api/reports/${reportId}`).send({ sections }).expect(200);
    const [kept] = (await request(server).get(`/api/reports/${reportId}/notes`).expect(200)).body.notes;
    expect(kept).toMatchObject({ id: note.id, claim: null });

    await request(server).patch(`/api/reports/${reportId}`).send({ status: 'final' }).expect(409);
  });
});
