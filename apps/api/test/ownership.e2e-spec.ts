import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { signedIn } from './support/auth.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

/** Riwayat, kasus, dan laporan hanya bisa dibaca dan diubah oleh akun pemiliknya. */
describe('proteksi auth riwayat, kasus, dan laporan', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let rina: Awaited<ReturnType<typeof signedIn>>;
  let sari: Awaited<ReturnType<typeof signedIn>>;
  const now = new Date('2026-10-03T05:00:00Z');
  const page = { kind: 'token', title: 'Nebula Finance (NBLA)', chain: 'robinhood', href: '/token/robinhood/0xabc' };

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
    rina = await signedIn(app, 'rina@contoh.id');
    sari = await signedIn(app, 'sari@contoh.id');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it('tanpa sesi semua endpoint menyimpan dan membaca dijawab 401', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/investigations').expect(401);
    await request(server).post('/api/investigations').send(page).expect(401);
    await request(server).delete('/api/investigations/1').expect(401);
    await request(server).get('/api/cases').expect(401);
    await request(server).post('/api/cases').send({ title: 'Kasus' }).expect(401);
    await request(server).post('/api/cases/1/items').send({ note: 'x' }).expect(401);
    await request(server).get('/api/reports').expect(401);
    await request(server).post('/api/reports').send({ title: 'Laporan' }).expect(401);
    await request(server).get('/api/reports/1/export?format=csv').expect(401);
    await request(server).get('/api/investigations').set('Cookie', 'openchain_session=bukan-token').expect(401);
    expect(await db.select().from(schema.investigations)).toEqual([]);
    expect(await db.select().from(schema.cases)).toEqual([]);
  });

  it('akun lain tidak melihat dan tidak bisa mengubah data milik akun ini (404, bukan 403)', async () => {
    const entry = (await rina().post('/api/investigations').send(page).expect(201)).body;
    const kasus = (await rina().post('/api/cases').send({ title: 'Pendana NBLA', note: 'Cek pendana bersama' }).expect(201)).body;
    const laporan = (await rina().post('/api/reports').send({ title: 'Laporan NBLA', caseId: kasus.caseId }).expect(201)).body;

    // Daftar milik akun lain kosong.
    expect((await sari().get('/api/investigations').expect(200)).body).toMatchObject({ entries: [], total: 0 });
    expect((await sari().get('/api/cases').expect(200)).body).toEqual([]);
    expect((await sari().get('/api/reports').expect(200)).body).toEqual([]);

    // Kasus orang lain dijawab sama seperti kasus yang tidak ada.
    const missing = await sari().get('/api/cases/999999').expect(404);
    const foreign = await sari().get(`/api/cases/${kasus.caseId}`).expect(404);
    expect(foreign.body.message).toBe(missing.body.message);
    await sari().patch(`/api/cases/${kasus.caseId}`).send({ title: 'Diambil alih' }).expect(404);
    await sari().post(`/api/cases/${kasus.caseId}/items`).send({ note: 'Catatan asing' }).expect(404);
    await sari().delete(`/api/cases/${kasus.caseId}`).expect(404);
    await sari().delete(`/api/investigations/${entry.id}`).expect(404);

    // Laporan orang lain, termasuk ekspor dan tautan berbagi, juga 404.
    await sari().get(`/api/reports/${laporan.id}`).expect(404);
    await sari().get(`/api/reports/${laporan.id}/export?format=csv`).expect(404);
    await sari().get(`/api/reports/${laporan.id}/share`).expect(404);
    await sari().post(`/api/reports/${laporan.id}/notes`).send({ body: 'Catatan asing' }).expect(404);
    await sari().patch(`/api/reports/${laporan.id}`).send({ title: 'Diambil alih' }).expect(404);
    await sari().delete(`/api/reports/${laporan.id}`).expect(404);
    // Laporan tidak bisa dibuat dari kasus milik akun lain.
    await sari().post('/api/reports').send({ title: 'Salinan', caseId: kasus.caseId }).expect(404);

    // Halaman yang sama dicatat terpisah di riwayat tiap akun.
    const own = await sari().post('/api/investigations').send(page).expect(201);
    expect(own.body.id).not.toBe(entry.id);

    // Data pemilik tetap utuh.
    const kept = (await rina().get(`/api/cases/${kasus.caseId}`).expect(200)).body;
    expect(kept).toMatchObject({ title: 'Pendana NBLA', notes: [{ body: 'Cek pendana bersama' }] });
    expect((await rina().get(`/api/reports/${laporan.id}`).expect(200)).body.title).toBe('Laporan NBLA');
    expect((await rina().get('/api/investigations').expect(200)).body.entries).toHaveLength(1);
  });

  it('menghapus akun menghapus riwayat, kasus, dan laporannya', async () => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.emailNormalized, 'rina@contoh.id'));
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
    expect(await db.select().from(schema.investigations).where(eq(schema.investigations.ownerId, user.id))).toEqual([]);
    expect(await db.select().from(schema.cases)).toEqual([]);
    expect(await db.select().from(schema.reports)).toEqual([]);
    expect((await sari().get('/api/investigations').expect(200)).body.total).toBe(1);
  });
});
