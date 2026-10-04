import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE } from '../src/database/database.module.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

describe('/api/investigations', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');
  const tick = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
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

  const token = { kind: 'token', title: 'Nebula Finance (NBLA)', chain: 'robinhood', href: '/token/robinhood/0xabc', findingCount: 2 };

  it('mencatat halaman yang dibuka; membuka ulang memperbarui baris yang sama', async () => {
    const server = app.getHttpServer();
    const first = await request(server).post('/api/investigations').send(token).expect(201);
    expect(first.body).toMatchObject({ kind: 'token', title: 'Nebula Finance (NBLA)', chain: 'robinhood', openCount: 1, note: null, findingCount: 2, openedAt: now.toISOString() });
    expect(first.body.id).toMatch(/^\d+$/);

    tick(5);
    await request(server).post('/api/investigations').send({ kind: 'map', title: 'Peta NBLA', chain: 'robinhood', href: '/map/robinhood/0xabc' }).expect(201);
    tick(5);
    const again = await request(server).post('/api/investigations').send({ ...token, title: 'Nebula (NBLA)', findingCount: undefined, note: 'cek pendana' }).expect(200);
    expect(again.body).toMatchObject({ id: first.body.id, title: 'Nebula (NBLA)', openCount: 2, findingCount: 2, note: 'cek pendana', firstOpenedAt: first.body.openedAt, openedAt: now.toISOString() });
  });

  it('mendaftar riwayat terbaru dulu, bisa disaring jenis dan dibatasi', async () => {
    const server = app.getHttpServer();
    const { body } = await request(server).get('/api/investigations').expect(200);
    expect(body).toMatchObject({ total: 2, limit: 50 });
    expect(body.entries.map((entry: { kind: string }) => entry.kind)).toEqual(['token', 'map']);
    const maps = await request(server).get('/api/investigations?kind=map').expect(200);
    expect(maps.body).toMatchObject({ total: 1, entries: [{ title: 'Peta NBLA' }] });
    const one = await request(server).get('/api/investigations?limit=1').expect(200);
    expect(one.body).toMatchObject({ total: 2, limit: 1 });
    expect(one.body.entries).toHaveLength(1);
    await request(server).get('/api/investigations?kind=admin').expect(400);
    await request(server).get('/api/investigations?limit=201').expect(400);
  });

  it('menghapus satu riwayat; yang sudah tidak ada dijawab 404', async () => {
    const server = app.getHttpServer();
    const { body } = await request(server).get('/api/investigations?kind=map').expect(200);
    await request(server).delete(`/api/investigations/${body.entries[0].id}`).expect(204);
    await request(server).delete(`/api/investigations/${body.entries[0].id}`).expect(404);
    await request(server).delete('/api/investigations/abc').expect(400);
    expect((await request(server).get('/api/investigations').expect(200)).body.total).toBe(1);
  });

  it('menolak isian yang salah dan chain yang tidak dikenal', async () => {
    const server = app.getHttpServer();
    const notInvestigation = await request(server).post('/api/investigations').send({ ...token, href: '/admin/x' }).expect(400);
    expect(notInvestigation.body.message).toContain('Hanya halaman investigasi');
    await request(server).post('/api/investigations').send({ ...token, href: '/token/mars/0x1', chain: 'mars' }).expect(400);
    await request(server).post('/api/investigations').send({ ...token, note: 'x'.repeat(281) }).expect(400);
    await request(server).post('/api/investigations').send('bukan json').set('content-type', 'text/plain').expect(400);
  });
});
