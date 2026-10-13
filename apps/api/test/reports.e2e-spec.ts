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

describe('/api/reports', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');
  const tick = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));
  let caseId: string;
  let reportId: string;

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
    const created = await request(app.getHttpServer())
      .post('/api/cases')
      .send({
        title: 'Pendana wallet',
        subject: { kind: 'address', chain: 'ethereum', address: WALLET, title: 'Wallet', href: `/flow/ethereum/${WALLET}` },
        findings: [{ id: 'dana-masuk', title: 'Dana dari exchange', detail: '5 ETH', classification: 'external_label', evidenceTxHashes: [TX] }],
      })
      .expect(201);
    caseId = created.body.caseId;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  const draftSections = () => [
    {
      id: 'temuan',
      title: 'Temuan',
      blocks: [
        { kind: 'entity', id: 'subjek', subject: { kind: 'address', chain: 'ethereum', address: WALLET, title: 'Wallet', href: `/flow/ethereum/${WALLET}` } },
        { kind: 'claim', id: 'klaim', claim: { title: 'Dana dari exchange', detail: '5 ETH dari Bybit', classification: 'fact', evidenceTxHashes: [TX] } },
        { kind: 'note', id: 'catatan', body: 'Cek label exchange', claimBlockId: 'klaim' },
        { kind: 'evidence', id: 'bukti', chain: 'ethereum', txHash: MISSING_TX, caption: 'Kiriman lanjutan' },
      ],
    },
    { id: 'kosong', title: 'Kesimpulan', blocks: [] },
  ];

  it('buat dari kasus: judul dan snapshot kasus disalin, chain bukti klaim dari snapshot, bukti tersimpan dibaca, kesiapan dihitung', async () => {
    const server = app.getHttpServer();
    tick(1);
    const { body } = await request(server).post('/api/reports').send({ title: 'Laporan pendana', caseId, sections: draftSections() }).expect(201);
    reportId = body.id;
    expect(body).toMatchObject({
      title: 'Laporan pendana',
      summary: '',
      status: 'draft',
      finalizedAt: null,
      source: { caseId, title: 'Pendana wallet', href: `/kasus/${caseId}` },
      snapshot: { blocks: [{ chain: 'ethereum', blockNumber: 1_000 }], dataStatus: 'complete' },
      readiness: { ready: false },
    });
    const [temuan, kosong] = body.sections;
    expect(kosong).toEqual({ id: expect.stringMatching(/^\d+$/), title: 'Kesimpulan', blocks: [] });
    const [entity, claim, note, evidence] = temuan.blocks;
    expect(entity).toMatchObject({ kind: 'entity', subject: { kind: 'address', chain: 'ethereum', address: WALLET } });
    expect(claim.claim).toMatchObject({ classification: 'verified_fact', provider: null, observedAt: null, evidence: [{ chain: 'ethereum', txHash: TX }], evidenceTxHashes: [TX] });
    // Rujukan catatan memakai id sementara klien, disimpan sebagai id blok klaim.
    expect(note).toMatchObject({ kind: 'note', claimBlockId: claim.id, createdAt: now.toISOString(), editedAt: null });
    expect(evidence).toMatchObject({ kind: 'evidence', chain: 'ethereum', txHash: MISSING_TX });
    expect(body.evidence).toEqual([
      expect.objectContaining({ chain: 'ethereum', txHash: TX, stored: true, blockNumber: 700, movements: [expect.objectContaining({ from: FUNDER, to: WALLET, amount: '5' })] }),
      { chain: 'ethereum', txHash: MISSING_TX, stored: false, timestamp: null, blockNumber: null, movements: [], explorerUrl: expect.stringContaining(`/tx/${MISSING_TX}`) },
    ]);
    expect(body.readiness.issues.map((issue: { kind: string; level: string }) => [issue.kind, issue.level])).toEqual([
      ['claim_without_provider', 'blocker'],
      ['claim_without_time', 'blocker'],
      ['evidence_not_stored', 'warning'],
      ['empty_section', 'warning'],
    ]);

    const list = await request(server).get('/api/reports').expect(200);
    expect(list.body).toEqual([
      { id: reportId, title: 'Laporan pendana', summary: '', status: 'draft', updatedAt: now.toISOString(), sourceTitle: 'Pendana wallet', sectionCount: 2, claimCount: 1, evidenceCount: 2, blockerCount: 2 },
    ]);
  });

  it('simpan isi utuh: id blok yang dikirim lagi tetap, catatan yang diubah ditandai, yang tidak dikirim dihapus', async () => {
    const server = app.getHttpServer();
    const before = (await request(server).get(`/api/reports/${reportId}`).expect(200)).body;
    const [temuan, kosong] = before.sections;
    const [entity, claim, note] = temuan.blocks;
    tick(5);
    const { body } = await request(server)
      .patch(`/api/reports/${reportId}`)
      .send({
        summary: 'Ringkasan baru',
        sections: [
          { id: kosong.id, title: 'Kesimpulan', blocks: [{ kind: 'paragraph', id: 'baru', text: 'Dana berasal dari exchange.' }] },
          { id: temuan.id, title: 'Temuan utama', blocks: [entity, { ...note, body: 'Label exchange sudah dicek' }, claim] },
        ],
      })
      .expect(200);
    expect(body.summary).toBe('Ringkasan baru');
    expect(body.updatedAt).toBe(now.toISOString());
    expect(body.sections.map((section: { id: string; title: string }) => [section.id, section.title])).toEqual([
      [kosong.id, 'Kesimpulan'],
      [temuan.id, 'Temuan utama'],
    ]);
    const [savedEntity, savedNote, savedClaim] = body.sections[1].blocks;
    expect([savedEntity.id, savedNote.id, savedClaim.id]).toEqual([entity.id, note.id, claim.id]);
    expect(savedNote).toMatchObject({ body: 'Label exchange sudah dicek', createdAt: note.createdAt, editedAt: now.toISOString(), claimBlockId: claim.id });
    expect(body.sections[0].blocks).toEqual([{ kind: 'paragraph', id: expect.stringMatching(/^\d+$/), text: 'Dana berasal dari exchange.' }]);
    // Bukti tersemat tidak dikirim lagi, jadi terhapus.
    expect(body.evidence.map((item: { txHash: string }) => item.txHash)).toEqual([TX]);
  });

  it('final: ditolak selama ada blocker (perubahan di permintaan yang sama dibatalkan), lalu dikunci sampai dibuka lagi', async () => {
    const server = app.getHttpServer();
    const before = (await request(server).get(`/api/reports/${reportId}`).expect(200)).body;
    const refused = await request(server).patch(`/api/reports/${reportId}`).send({ title: 'Judul baru', status: 'final' }).expect(409);
    expect(refused.body.message).toContain('belum menyebut provider');
    const unchanged = (await request(server).get(`/api/reports/${reportId}`).expect(200)).body;
    expect(unchanged).toMatchObject({ title: before.title, status: 'draft', updatedAt: before.updatedAt });

    const sections = before.sections.map((section: { id: string; title: string; blocks: Array<Record<string, unknown>> }) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.kind === 'claim' ? { ...block, claim: { ...(block.claim as object), provider: 'Blockscout', observedAt: '2026-10-03T04:00:00Z' } } : block,
      ),
    }));
    tick(1);
    const final = await request(server).patch(`/api/reports/${reportId}`).send({ sections, status: 'final' }).expect(200);
    expect(final.body).toMatchObject({ status: 'final', finalizedAt: now.toISOString(), readiness: { ready: true } });

    await request(server).patch(`/api/reports/${reportId}`).send({ title: 'Ubah diam-diam' }).expect(409);
    await request(server).patch(`/api/reports/${reportId}`).send({ status: 'final' }).expect(409);
    const reopened = await request(server).patch(`/api/reports/${reportId}`).send({ status: 'review' }).expect(200);
    expect(reopened.body).toMatchObject({ status: 'review', finalizedAt: null });
  });

  it('laporan tanpa kasus: snapshot ditandai tidak tersedia, hash klaim wajib menyebut chain; kasus dihapus tidak menghapus laporan', async () => {
    const server = app.getHttpServer();
    const blank = await request(server).post('/api/reports').send({ title: 'Catatan bebas' }).expect(201);
    expect(blank.body).toMatchObject({ source: null, sections: [], snapshot: { dataStatus: 'unavailable', blocks: [], sources: [] } });
    expect(blank.body.readiness.issues).toEqual([expect.objectContaining({ kind: 'snapshot_incomplete', message: expect.stringContaining('belum memakai snapshot') })]);
    const claimOnly = [{ title: 'A', blocks: [{ kind: 'claim', claim: { title: 'Tanpa chain', classification: 'fact', evidenceTxHashes: [TX] } }] }];
    const noChain = await request(server).patch(`/api/reports/${blank.body.id}`).send({ sections: claimOnly }).expect(400);
    expect(noChain.body.message).toContain('wajib menyebut chain');
    await request(server)
      .patch(`/api/reports/${blank.body.id}`)
      .send({ sections: [{ title: 'A', blocks: [{ kind: 'evidence', chain: 'mars', txHash: TX, caption: '' }] }] })
      .expect(400);

    await request(server).delete(`/api/cases/${caseId}`).expect(204);
    const kept = await request(server).get(`/api/reports/${reportId}`).expect(200);
    expect(kept.body.source).toEqual({ caseId: null, title: 'Pendana wallet', href: null });
  });

  it('galat: id rusak 400, tidak ada 404, kasus tak dikenal 404, isi salah 400, hapus 204', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/reports/abc').expect(400);
    await request(server).get('/api/reports/999').expect(404);
    await request(server).post('/api/reports').send({ title: 'X', caseId: 999 }).expect(404);
    await request(server).post('/api/reports').send({ title: '' }).expect(400);
    await request(server).patch(`/api/reports/${reportId}`).send({}).expect(400);
    await request(server).patch('/api/reports/999').send({ title: 'X' }).expect(404);
    await request(server).delete(`/api/reports/${reportId}`).expect(204);
    await request(server).delete(`/api/reports/${reportId}`).expect(404);
  });
});
