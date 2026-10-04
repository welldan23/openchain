import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import { createTestDatabase, seedToken, type TestDatabase } from './support/database.js';

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

describe('/api/cases', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');
  const tick = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    await seedToken(db, { address: TOKEN });
    await new FundFlowIngestionService(db as unknown as Database).persist(scanOf('ethereum', WALLET, new Date('2026-10-03T04:00:00Z')), 'evm');
    const [funder] = await db
      .select()
      .from(schema.addresses)
      .where(and(eq(schema.addresses.chainId, 'ethereum'), eq(schema.addresses.addressNormalized, FUNDER)));
    await db.insert(schema.labels).values({ addressId: funder.id, labelType: 'exchange', name: 'Bybit: Hot Wallet 6', source: 'external', sourceName: 'Blockscout', classification: 'external_label' });
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

  const tokenSubject = { kind: 'token', chain: 'robinhood', address: TOKEN, title: 'Nebula Finance (NBLA)', href: `/token/robinhood/${TOKEN}` };
  const finding = { id: 'cluster-1', title: 'Kelompok dompet didanai satu sumber', detail: '3 dompet', classification: 'heuristic', chain: 'robinhood', evidenceTxHashes: [MISSING_TX] };
  let caseId: string;

  it('kasus kosong: snapshot tidak tersedia beserta alasannya', async () => {
    const server = app.getHttpServer();
    const created = await request(server).post('/api/cases').send({ title: '  Kasus kosong ', tags: ['Rug', 'rug'] }).expect(201);
    expect(created.body).toMatchObject({ caseTitle: 'Kasus kosong', created: true, subjectAdded: false, addedFindings: 0, noteAdded: false, stepAdded: false });
    const { body } = await request(server).get(`/api/cases/${created.body.caseId}`).expect(200);
    expect(body).toMatchObject({ title: 'Kasus kosong', status: 'open', tags: ['rug'], subjects: [], findings: [], evidence: [], notes: [], steps: [] });
    expect(body.snapshot).toMatchObject({ dataStatus: 'unavailable', blocks: [], sources: [], fetchedAt: now.toISOString() });
    expect(body.snapshot.statusReason).toContain('belum punya subjek');
  });

  it('kasus baru dengan token, temuan, catatan, dan langkah; snapshot memakai data token tersimpan', async () => {
    const server = app.getHttpServer();
    tick(1);
    const created = await request(server)
      .post('/api/cases')
      .send({ title: 'Investigasi NBLA', summary: 'Cek pendana', subject: tokenSubject, findings: [finding], note: 'cek ulang besok', step: { kind: 'map', title: 'Peta NBLA', chain: 'robinhood', href: `/map/robinhood/${TOKEN}` } })
      .expect(201);
    expect(created.body).toMatchObject({ caseTitle: 'Investigasi NBLA', created: true, subjectAdded: true, addedFindings: 1, skippedFindings: 0, noteAdded: true, stepAdded: true });
    caseId = created.body.caseId;

    const { body } = await request(server).get(`/api/cases/${caseId}`).expect(200);
    expect(body.subjects).toEqual([expect.objectContaining({ kind: 'token', chain: 'robinhood', address: TOKEN, label: null })]);
    expect(body.findings).toEqual([{ id: 'cluster-1', title: finding.title, detail: '3 dompet', classification: 'heuristic', evidence: [{ chain: 'robinhood', txHash: MISSING_TX }] }]);
    // Hash yang belum tercatat tetap ditampilkan, tapi ditandai tidak tersimpan.
    expect(body.evidence).toEqual([{ chain: 'robinhood', txHash: MISSING_TX, stored: false, timestamp: null, blockNumber: null, movements: [] }]);
    expect(body.notes).toEqual([expect.objectContaining({ body: 'cek ulang besok' })]);
    expect(body.steps).toEqual([expect.objectContaining({ kind: 'map', href: `/map/robinhood/${TOKEN}` })]);
    // Snapshot token terbaru berstatus partial: kasusnya ikut partial dengan alasan.
    expect(body.snapshot).toMatchObject({
      fetchedAt: '2026-10-03T04:30:00.000Z',
      blocks: [{ chain: 'robinhood', blockNumber: 23512880 }],
      sources: ['blockscout', 'robinhood-rpc'],
      dataStatus: 'partial',
    });
    expect(body.snapshot.statusReason).toContain('Nebula Finance (NBLA)');
  });

  it('menambah item ke kasus: yang sudah ada tidak digandakan; bukti tersimpan dibaca dari data', async () => {
    const server = app.getHttpServer();
    tick(1);
    const walletSubject = { kind: 'address', chain: 'ethereum', address: WALLET.toUpperCase().replace('0X', '0x'), title: 'Dompet C1', href: `/flow/ethereum/${WALLET}` };
    const added = await request(server)
      .post(`/api/cases/${caseId}/items`)
      .send({
        subject: walletSubject,
        findings: [finding, { id: 'funding', title: 'Didanai exchange', classification: 'fact', evidenceTxHashes: [TX.toUpperCase().replace('0X', '0x')] }],
        step: { kind: 'map', title: 'Peta NBLA lagi', chain: 'robinhood', href: `/map/robinhood/${TOKEN}` },
      })
      .expect(200);
    expect(added.body).toMatchObject({ caseId, created: false, subjectAdded: true, addedFindings: 1, skippedFindings: 1, noteAdded: false, stepAdded: false });

    const again = await request(server).post(`/api/cases/${caseId}/items`).send({ subject: walletSubject }).expect(200);
    expect(again.body).toMatchObject({ subjectAdded: false, addedFindings: 0 });

    const { body } = await request(server).get(`/api/cases/${caseId}`).expect(200);
    expect(body.subjects.map((subject: { kind: string }) => subject.kind)).toEqual(['token', 'address']);
    expect(body.findings.map((item: { id: string; classification: string }) => [item.id, item.classification])).toEqual([
      ['cluster-1', 'heuristic'],
      ['funding', 'verified_fact'],
    ]);
    const stored = body.evidence.find((item: { txHash: string }) => item.txHash === TX);
    expect(stored).toMatchObject({ chain: 'ethereum', stored: true, blockNumber: 700, timestamp: '2026-10-01T00:00:00.000Z' });
    expect(stored.movements).toEqual([
      { from: FUNDER, to: WALLET, asset: { type: 'native', symbol: 'ETH', decimals: 18 }, amountRaw: '5000000000000000000', amount: '5', amountUsd: null },
    ]);
    expect(body.steps).toEqual([expect.objectContaining({ title: 'Peta NBLA lagi', openedAt: now.toISOString() })]);
    expect(body.snapshot.blocks).toEqual([
      { chain: 'robinhood', blockNumber: 23512880 },
      { chain: 'ethereum', blockNumber: 1000 },
    ]);
    expect(body.snapshot.fetchedAt).toBe('2026-10-03T04:30:00.000Z');
  });

  it('subjek multichain memakai label dari chain mana pun; daftar kasus menghitung isinya', async () => {
    const server = app.getHttpServer();
    tick(1);
    const created = await request(server)
      .post('/api/cases')
      .send({ title: 'Pendana', subject: { kind: 'address', address: FUNDER, title: 'Pendana', href: `/multichain/${FUNDER}` } })
      .expect(201);
    const { body } = await request(server).get(`/api/cases/${created.body.caseId}`).expect(200);
    expect(body.subjects[0]).toMatchObject({ chain: null, label: { type: 'exchange', name: 'Bybit: Hot Wallet 6', source: 'external' } });
    // Pendana belum pernah dipindai sendiri: tidak ada data, bukan "lengkap".
    expect(body.snapshot).toMatchObject({ dataStatus: 'unavailable' });

    const list = await request(server).get('/api/cases').expect(200);
    expect(list.body.map((item: { title: string }) => item.title)).toEqual(['Pendana', 'Investigasi NBLA', 'Kasus kosong']);
    expect(list.body[1]).toMatchObject({ chains: ['robinhood', 'ethereum'], subjectCount: 2, findingCount: 2, evidenceCount: 2, noteCount: 1, dataStatus: 'partial' });
  });

  it('mengubah judul, status, dan tag; menghapus temuan, catatan, subjek, lalu kasusnya', async () => {
    const server = app.getHttpServer();
    tick(1);
    const updated = await request(server).patch(`/api/cases/${caseId}`).send({ status: 'monitoring', tags: ['bridge'] }).expect(200);
    expect(updated.body).toMatchObject({ status: 'monitoring', tags: ['bridge'], updatedAt: now.toISOString() });
    await request(server).patch(`/api/cases/${caseId}`).send({}).expect(400);
    await request(server).patch(`/api/cases/${caseId}`).send({ status: 'archived' }).expect(400);

    await request(server).delete(`/api/cases/${caseId}/findings/cluster-1`).expect(204);
    await request(server).delete(`/api/cases/${caseId}/findings/cluster-1`).expect(404);
    const note = updated.body.notes[0].id;
    await request(server).delete(`/api/cases/${caseId}/notes/${note}`).expect(204);
    const token = updated.body.subjects.find((subject: { kind: string }) => subject.kind === 'token').id;
    await request(server).delete(`/api/cases/${caseId}/subjects/${token}`).expect(204);
    await request(server).delete(`/api/cases/${caseId}/subjects/${token}`).expect(404);

    const { body } = await request(server).get(`/api/cases/${caseId}`).expect(200);
    expect(body.findings.map((item: { id: string }) => item.id)).toEqual(['funding']);
    expect(body.notes).toEqual([]);
    // Snapshot dibekukan ulang dari subjek yang tersisa (dompet di Ethereum, lengkap).
    expect(body.snapshot).toMatchObject({ dataStatus: 'complete', statusReason: null, blocks: [{ chain: 'ethereum', blockNumber: 1000 }] });

    await request(server).delete(`/api/cases/${caseId}`).expect(204);
    await request(server).delete(`/api/cases/${caseId}`).expect(404);
    await request(server).get(`/api/cases/${caseId}`).expect(404);
    expect(await db.select().from(schema.caseFindings).where(eq(schema.caseFindings.caseId, Number(caseId)))).toEqual([]);
  });

  it('menolak isi yang salah dengan 400 yang jelas, dan kasus yang tidak ada dengan 404', async () => {
    const server = app.getHttpServer();
    const reject = async (path: string, body: object, message: string) => {
      const response = await request(server).post(path).send(body).expect(400);
      expect(response.body.message).toContain(message);
    };
    await reject('/api/cases', { title: ' ' }, 'Judul kasus wajib diisi');
    await reject('/api/cases', { title: 'x', findings: [{ ...finding, evidenceTxHashes: [] }] }, 'tanpa hash bukti');
    await reject('/api/cases', { title: 'x', findings: [{ ...finding, chain: undefined }] }, 'butuh chain');
    await reject('/api/cases', { title: 'x', subject: { ...tokenSubject, chain: 'mars' } }, 'Chain "mars" tidak dikenal');
    await reject('/api/cases', { title: 'x', subject: { ...tokenSubject, address: 'bukan-address' } }, 'Address subjek tidak valid');
    await reject('/api/cases', { title: 'x', findings: [{ ...finding, evidenceTxHashes: ['A'.repeat(44)] }] }, 'tidak valid untuk');
    await reject('/api/cases', { title: 'x', note: 'x'.repeat(281) }, 'maksimal 280');
    await request(server).post('/api/cases/999/items').send({ note: 'halo' }).expect(404);
    await request(server).get('/api/cases/abc').expect(400);
    await request(server).delete('/api/cases/999/notes/1').expect(404);
  });
});
