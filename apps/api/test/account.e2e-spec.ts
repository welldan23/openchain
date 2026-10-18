import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SESSION_COOKIE } from '../src/auth/session-token.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE } from '../src/database/database.module.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

describe('/api/account', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let now = new Date('2026-10-03T05:00:00Z');
  let cookie: string;

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
    const res = await request(app.getHttpServer()).post('/api/auth/sign-up').send({ name: 'Rina Analis', email: 'rina@contoh.id', password: 'rahasia123' }).expect(201);
    const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((item) => item.startsWith(`${SESSION_COOKIE}=`))!;
    cookie = header.split(';')[0];
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it('semua endpoint profil butuh masuk', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/account/profile').expect(401);
    await request(server).patch('/api/account/profile').send({ displayName: 'X Y' }).expect(401);
    await request(server).put('/api/account/avatar').attach('avatar', PNG, 'a.png').expect(401);
    await request(server).get('/api/account/avatar').expect(401);
  });

  it('baca dan ubah profil: nama dan zona waktu; respons sesi ikut berubah', async () => {
    const server = app.getHttpServer();
    const { body } = await request(server).get('/api/account/profile').set('Cookie', cookie).expect(200);
    expect(body).toEqual({ id: expect.any(String), email: 'rina@contoh.id', displayName: 'Rina Analis', timezone: 'Asia/Jakarta', joinedAt: now.toISOString(), avatarUrl: null, avatar: null });
    now = new Date('2026-10-03T06:00:00Z');
    const updated = await request(server).patch('/api/account/profile').set('Cookie', cookie).send({ displayName: '  Rina Investigator ', timezone: 'Asia/Makassar' }).expect(200);
    expect(updated.body).toMatchObject({ displayName: 'Rina Investigator', timezone: 'Asia/Makassar' });
    const session = await request(server).get('/api/auth/session').set('Cookie', cookie).expect(200);
    expect(session.body.user).toMatchObject({ displayName: 'Rina Investigator', timezone: 'Asia/Makassar' });
    await request(server).patch('/api/account/profile').set('Cookie', cookie).send({ timezone: 'WITA' }).expect(400);
    await request(server).patch('/api/account/profile').set('Cookie', cookie).send({}).expect(400);
  });

  it('foto: diunggah, dilayani dengan jenis dari isinya, ETag, dan nosniff; diganti dan dihapus', async () => {
    const server = app.getHttpServer();
    const uploaded = await request(server).put('/api/account/avatar').set('Cookie', cookie).attach('avatar', PNG, { filename: 'foto.jpg', contentType: 'image/jpeg' }).expect(200);
    expect(uploaded.body.avatar).toEqual({ contentType: 'image/png', size: PNG.length, updatedAt: now.toISOString() });
    expect(uploaded.body.avatarUrl).toMatch(/^\/api\/account\/avatar\?v=[0-9a-f]{12}$/);
    const image = await request(server).get('/api/account/avatar').set('Cookie', cookie).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);
    await request(server).get('/api/account/avatar').set('Cookie', cookie).set('If-None-Match', image.headers.etag).expect(304);

    const replaced = await request(server).put('/api/account/avatar').set('Cookie', cookie).attach('avatar', JPEG, 'foto.png').expect(200);
    expect(replaced.body.avatar.contentType).toBe('image/jpeg');
    expect(replaced.body.avatarUrl).not.toBe(uploaded.body.avatarUrl);

    const removed = await request(server).delete('/api/account/avatar').set('Cookie', cookie).expect(200);
    expect(removed.body).toMatchObject({ avatarUrl: null, avatar: null });
    await request(server).get('/api/account/avatar').set('Cookie', cookie).expect(404);
  });

  it('foto ditolak: SVG (walau berlabel PNG), tanpa berkas, dan lebih dari 2 MB', async () => {
    const server = app.getHttpServer();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const bad = await request(server).put('/api/account/avatar').set('Cookie', cookie).attach('avatar', svg, { filename: 'foto.png', contentType: 'image/png' }).expect(400);
    expect(bad.body.message).toContain('PNG, JPG, atau WebP');
    await request(server).put('/api/account/avatar').set('Cookie', cookie).field('lain', 'x').expect(400);
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    await request(server).put('/api/account/avatar').set('Cookie', cookie).attach('avatar', big, 'besar.png').expect(413);
    const { body } = await request(server).get('/api/account/profile').set('Cookie', cookie).expect(200);
    expect(body.avatar).toBeNull();
  });
});
