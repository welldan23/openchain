import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
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

describe('tautan berbagi laporan publik', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');
  const tick = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));
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
    const claim = { title: 'Dana dari exchange', detail: '5 ETH', classification: 'fact', provider: 'Blockscout', observedAt: '2026-10-03T04:00:00Z', evidence: [{ chain: 'ethereum', txHash: TX }] };
    const { body } = await request(app.getHttpServer())
      .post('/api/reports')
      .send({ title: 'Laporan publik', sections: [{ title: 'Temuan', blocks: [{ kind: 'claim', claim }, { kind: 'note', body: 'Catatan untuk pembaca' }] }] })
      .expect(201);
    reportId = body.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it('hanya laporan final yang bisa dibagikan; token ditunjukkan sekali dan hanya hash-nya disimpan', async () => {
    const server = app.getHttpServer();
    const draft = await request(server).get(`/api/reports/${reportId}/share`).expect(200);
    expect(draft.body).toMatchObject({ shareable: false, links: [] });
    expect(draft.body.reason).toContain('Hanya laporan final');
    await request(server).post(`/api/reports/${reportId}/share`).send({}).expect(409);

    await request(server).patch(`/api/reports/${reportId}`).send({ status: 'final' }).expect(200);
    tick(1);
    const { body } = await request(server).post(`/api/reports/${reportId}/share`).send({ expiresInDays: 7 }).expect(201);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(body).toMatchObject({
      prefix: body.token.slice(0, 6),
      status: 'active',
      viewCount: 0,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
      path: `/publik/laporan/${body.token}`,
      apiPath: `/public/reports/${body.token}`,
    });
    const [stored] = await db.select().from(schema.reportShareLinks);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(body.token);
    const list = await request(server).get(`/api/reports/${reportId}/share`).expect(200);
    expect(list.body).toMatchObject({ shareable: true, reason: null, links: [{ id: body.id, prefix: body.prefix, status: 'active' }] });
    expect(JSON.stringify(list.body)).not.toContain(body.token);
  });

  it('pembaca publik: laporan hanya-baca tanpa tautan internal, dihitung dilihat, tidak di-cache; ekspor juga tersedia', async () => {
    const server = app.getHttpServer();
    const { body: created } = await request(server).post(`/api/reports/${reportId}/share`).send().expect(201);
    tick(2);
    const view = await request(server).get(`/api/public/reports/${created.token}`).expect(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(view.body).toMatchObject({ title: 'Laporan publik', status: 'final', source: null, share: { createdAt: created.createdAt, expiresAt: null }, readiness: { ready: true } });
    expect(view.body.sections[0].blocks.map((block: { kind: string }) => block.kind)).toEqual(['claim', 'note']);
    expect(view.body.evidence[0]).toMatchObject({ txHash: TX, stored: true });
    const links = (await request(server).get(`/api/reports/${reportId}/share`).expect(200)).body.links;
    expect(links.find((link: { id: string }) => link.id === created.id)).toMatchObject({ viewCount: 1, lastViewedAt: now.toISOString() });

    const pdf = await request(server).get(`/api/public/reports/${created.token}/export?format=pdf`).responseType('blob').expect(200);
    expect((pdf.body as Buffer).toString('latin1').startsWith('%PDF-1.4')).toBe(true);
    await request(server).get(`/api/public/reports/${created.token}/export?format=docx`).expect(400);
  });

  it('tautan tak dikenal 404; dicabut, kedaluwarsa, atau laporan sedang direvisi 410', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/public/reports/bukan-token').expect(404);
    await request(server).get(`/api/public/reports/${'A'.repeat(32)}`).expect(404);

    const { body: expiring } = await request(server).post(`/api/reports/${reportId}/share`).send({ expiresInDays: 1 }).expect(201);
    tick(24 * 60 + 1);
    const expired = await request(server).get(`/api/public/reports/${expiring.token}`).expect(410);
    expect(expired.body.message).toContain('kedaluwarsa');

    const { body: revoked } = await request(server).post(`/api/reports/${reportId}/share`).send().expect(201);
    await request(server).delete(`/api/reports/${reportId}/share/${revoked.id}`).expect(204);
    await request(server).delete(`/api/reports/${reportId}/share/${revoked.id}`).expect(204);
    expect((await request(server).get(`/api/public/reports/${revoked.token}`).expect(410)).body.message).toContain('dicabut');
    await request(server).delete(`/api/reports/${reportId}/share/99999`).expect(404);

    const { body: active } = await request(server).post(`/api/reports/${reportId}/share`).send().expect(201);
    await request(server).patch(`/api/reports/${reportId}`).send({ status: 'review' }).expect(200);
    expect((await request(server).get(`/api/public/reports/${active.token}`).expect(410)).body.message).toContain('sedang direvisi');
    await request(server).patch(`/api/reports/${reportId}`).send({ status: 'final' }).expect(200);
    await request(server).get(`/api/public/reports/${active.token}`).expect(200);

    await request(server).post(`/api/reports/${reportId}/share`).send({ expiresInDays: 400 }).expect(400);
    await request(server).post('/api/reports/999/share').send().expect(404);
    // Menghapus laporan menghapus tautannya.
    await request(server).delete(`/api/reports/${reportId}`).expect(204);
    await request(server).get(`/api/public/reports/${active.token}`).expect(404);
  });
});
