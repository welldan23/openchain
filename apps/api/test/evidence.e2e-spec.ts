import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE } from '../src/database/database.module.js';
import {
  createTestDatabase,
  seedContractChecks,
  seedRiskFindings,
  seedToken,
  testTxHash,
  type TestDatabase,
} from './support/database.js';

const TOKEN = '0x' + 'EF'.repeat(20);
const NO_SNAPSHOT_TOKEN = '0x' + 'FA'.repeat(20);

interface EvidenceItem {
  txHash: string | null;
  blockNumber: number | null;
  classification: string;
  relatedFindings: string[];
  relatedChecks: string[];
}

describe('GET /api/tokens/:chain/:address/evidence', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let snapshotId: number;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const { snapshots } = await seedToken(db, { address: TOKEN });
    snapshotId = snapshots[1].id;
    const { taxEvidence } = await seedContractChecks(db, 'robinhood', snapshotId);
    await seedRiskFindings(db, 'robinhood', snapshotId, taxEvidence.id);
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

  const url = (query = '', address = TOKEN) => `/api/tokens/robinhood/${address}/evidence${query}`;

  it('mengembalikan temuan urut keparahan beserta jumlah buktinya', async () => {
    const { body } = await request(app.getHttpServer()).get(url()).expect(200);
    expect(body.findings).toEqual([
      expect.objectContaining({ code: 'owner_can_change_tax', severity: 'high', evidenceCount: 1 }),
      expect.objectContaining({ code: 'liquidity_lock_claim', severity: 'medium', evidenceCount: 1 }),
      expect.objectContaining({ code: 'common_funding', severity: 'medium', evidenceCount: 3 }),
    ]);
    expect(body.filter).toEqual({ finding: null, classification: null });
  });

  it('menampilkan semua bukti temuan dan cek kontrak, terbaru lebih dulu', async () => {
    const { body } = await request(app.getHttpServer()).get(url()).expect(200);
    const blocks = body.evidence.map((item: EvidenceItem) => item.blockNumber);
    // 4 bukti temuan + 1 bukti deploy dari cek kontrak; bukti pajak dipakai bersama.
    expect(blocks).toEqual([23400000, 23100300, 23100200, 23100100, 23100000, null]);
    const tax = body.evidence[0] as EvidenceItem;
    expect(tax.txHash).toBe(testTxHash(`tax-${snapshotId}`));
    expect(tax.relatedFindings).toEqual(['owner_can_change_tax']);
    expect(tax.relatedChecks).toEqual(['tax']);
    const deploy = body.evidence[4] as EvidenceItem;
    expect(deploy).toMatchObject({ relatedFindings: [], relatedChecks: ['ownership'] });
    const assumption = body.evidence[5] as EvidenceItem;
    expect(assumption).toMatchObject({ classification: 'assumption', txHash: null, relatedFindings: ['liquidity_lock_claim'] });
  });

  it('menyaring bukti untuk satu temuan', async () => {
    const { body } = await request(app.getHttpServer()).get(url('?finding=common_funding')).expect(200);
    expect(body.filter).toEqual({ finding: 'common_funding', classification: null });
    expect(body.evidence.map((item: EvidenceItem) => item.blockNumber)).toEqual([23100300, 23100200, 23100100]);
    expect(body.evidence.every((item: EvidenceItem) => item.relatedFindings.includes('common_funding'))).toBe(true);
    // Daftar temuan tetap lengkap supaya filter bisa diganti.
    expect(body.findings).toHaveLength(3);
  });

  it('menggabungkan filter temuan dan klasifikasi', async () => {
    const { body } = await request(app.getHttpServer())
      .get(url('?finding=common_funding&classification=heuristic'))
      .expect(200);
    expect(body.evidence).toHaveLength(1);
    expect(body.evidence[0]).toMatchObject({
      classification: 'heuristic',
      heuristicName: 'common_direct_funder',
      confidence: 0.64,
    });
  });

  it('menyaring menurut klasifikasi saja', async () => {
    const { body } = await request(app.getHttpServer()).get(url('?classification=verified_fact')).expect(200);
    expect(body.evidence.map((item: EvidenceItem) => item.blockNumber)).toEqual([
      23400000, 23100200, 23100100, 23100000,
    ]);
  });

  it('404 untuk kode temuan yang tidak ada', async () => {
    const { body } = await request(app.getHttpServer()).get(url('?finding=tidak_ada')).expect(404);
    expect(body.message).toBe('Temuan "tidak_ada" tidak ada di snapshot ini.');
  });

  it('400 untuk klasifikasi yang tidak dikenal', async () => {
    const { body } = await request(app.getHttpServer()).get(url('?classification=fakta')).expect(400);
    expect(body.message).toContain('verified_fact');
  });

  it('daftar kosong untuk token tanpa snapshot', async () => {
    const { body } = await request(app.getHttpServer()).get(url('', NO_SNAPSHOT_TOKEN)).expect(200);
    expect(body).toMatchObject({ snapshot: null, dataStatus: 'unavailable', findings: [], evidence: [] });
  });
});
