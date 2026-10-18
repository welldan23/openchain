import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import { eq, isNull } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/session-token.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const PASSWORD = 'rahasia123';

/** Token sesi dari header Set-Cookie, beserta atributnya. */
function sessionCookie(res: request.Response): { token: string; attributes: string[] } {
  const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  if (!header) throw new Error('cookie sesi tidak dipasang');
  const [pair, ...attributes] = header.split(';').map((item) => item.trim());
  return { token: pair.slice(SESSION_COOKIE.length + 1), attributes };
}

describe('/api/auth', () => {
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

  it('daftar: akun dibuat, sesi dipasang lewat cookie HttpOnly, token tidak ada di body maupun database', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/sign-up').send({ name: ' Rina Analis ', email: ' Rina@Contoh.id ', password: PASSWORD }).expect(201);
    expect(res.body).toEqual({
      user: { id: expect.any(String), email: 'Rina@Contoh.id', displayName: 'Rina Analis', timezone: 'Asia/Jakarta', createdAt: now.toISOString() },
      session: { expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString() },
    });
    expect(res.headers['cache-control']).toBe('no-store');
    const { token, attributes } = sessionCookie(res);
    expect(attributes).toEqual(expect.arrayContaining(['Path=/', 'HttpOnly', 'SameSite=Lax']));
    expect(attributes.some((item) => item.startsWith('Expires='))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(token);
    const [user] = await db.select().from(schema.users);
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    const [session] = await db.select().from(schema.userSessions);
    expect(session.tokenHash).toBe(hashSessionToken(token));

    const current = await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${token}`).expect(200);
    expect(current.body.user).toMatchObject({ email: 'Rina@Contoh.id', displayName: 'Rina Analis' });
  });

  it('daftar: email terdaftar (beda huruf besar-kecil) 409, isian salah 400', async () => {
    const server = app.getHttpServer();
    const taken = await request(server).post('/api/auth/sign-up').send({ name: 'Rina Lain', email: 'RINA@contoh.id', password: 'lainnya123' }).expect(409);
    expect(taken.body.message).toContain('sudah terdaftar');
    await request(server).post('/api/auth/sign-up').send({ name: 'Budi', email: 'budi@contoh.id', password: 'pendek1' }).expect(400);
    await request(server).post('/api/auth/sign-up').send({ name: 'Budi', email: 'budi@contoh', password: PASSWORD }).expect(400);
    await request(server).post('/api/auth/sign-up').send('teks biasa').expect(400);
    expect(await db.select().from(schema.users)).toHaveLength(1);
  });

  it('masuk: email tak dikenal dan kata sandi salah dijawab sama; berhasil membuat sesi baru', async () => {
    const server = app.getHttpServer();
    const wrong = await request(server).post('/api/auth/sign-in').send({ email: 'rina@contoh.id', password: 'salah1234' }).expect(401);
    const unknown = await request(server).post('/api/auth/sign-in').send({ email: 'siapa@contoh.id', password: PASSWORD }).expect(401);
    expect(wrong.body.message).toBe('Email atau kata sandi salah.');
    expect(unknown.body.message).toBe(wrong.body.message);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    tick(10);
    const ok = await request(server).post('/api/auth/sign-in').send({ email: ' RINA@contoh.id ', password: PASSWORD }).expect(200);
    const { token } = sessionCookie(ok);
    expect(await db.select().from(schema.userSessions)).toHaveLength(2);
    const [user] = await db.select().from(schema.users);
    expect(user).toMatchObject({ failedSignIns: 0, lastSignInAt: now });
    await request(server).get('/api/auth/session').set('Cookie', `lain=1; ${SESSION_COOKIE}=${token}`).expect(200);
  });

  it('5 kali gagal berturut-turut mengunci akun 15 menit, bahkan dengan kata sandi benar; setelahnya bisa masuk lagi', async () => {
    const server = app.getHttpServer();
    for (let attempt = 1; attempt <= 4; attempt += 1) await request(server).post('/api/auth/sign-in').send({ email: 'rina@contoh.id', password: 'salah1234' }).expect(401);
    const locked = await request(server).post('/api/auth/sign-in').send({ email: 'rina@contoh.id', password: 'salah1234' }).expect(429);
    expect(locked.headers['retry-after']).toBe('900');
    expect(locked.body.message).toContain('15 menit');
    tick(5);
    const still = await request(server).post('/api/auth/sign-in').send({ email: 'rina@contoh.id', password: PASSWORD }).expect(429);
    expect(still.headers['retry-after']).toBe('600');
    tick(11);
    await request(server).post('/api/auth/sign-in').send({ email: 'rina@contoh.id', password: PASSWORD }).expect(200);
  });

  it('sesi: tanpa cookie, cookie rusak, token tak dikenal, atau kedaluwarsa dijawab 401', async () => {
    const server = app.getHttpServer();
    const ok = await request(server).post('/api/auth/sign-in').send({ email: 'rina@contoh.id', password: PASSWORD }).expect(200);
    const { token } = sessionCookie(ok);
    await request(server).get('/api/auth/session').expect(401);
    await request(server).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=bukan-token`).expect(401);
    await request(server).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${'A'.repeat(43)}`).expect(401);
    tick(30 * 24 * 60 + 1);
    await request(server).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${token}`).expect(401);
  });

  it('keluar: hanya sesi perangkat ini yang dicabut, cookie dihapus, aman dipanggil berulang', async () => {
    const server = app.getHttpServer();
    const signIn = async () => sessionCookie(await request(server).post('/api/auth/sign-in').send({ email: 'rina@contoh.id', password: PASSWORD }).expect(200)).token;
    const laptop = await signIn();
    const phone = await signIn();
    const out = await request(server).post('/api/auth/sign-out').set('Cookie', `${SESSION_COOKIE}=${laptop}`).expect(204);
    const cleared = ([] as string[]).concat(out.headers['set-cookie'] ?? []).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
    expect(cleared).toMatch(/^openchain_session=;/);
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
    expect(cleared).toContain('HttpOnly');
    const denied = await request(server).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${laptop}`).expect(401);
    expect(denied.body.message).toContain('Masuk dulu');
    await request(server).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${phone}`).expect(200);
    await request(server).post('/api/auth/sign-out').set('Cookie', `${SESSION_COOKIE}=${laptop}`).expect(204);
    await request(server).post('/api/auth/sign-out').expect(204);
    const [revoked] = await db.select().from(schema.userSessions).where(eq(schema.userSessions.tokenHash, hashSessionToken(laptop)));
    expect(revoked.revokedAt).toEqual(now);
  });

  it('keluar dari semua perangkat: semua sesi pengguna itu dicabut, perlu sesi yang sah', async () => {
    const server = app.getHttpServer();
    const signIn = async () => sessionCookie(await request(server).post('/api/auth/sign-in').send({ email: 'rina@contoh.id', password: PASSWORD }).expect(200)).token;
    const [a, b] = [await signIn(), await signIn()];
    await request(server).post('/api/auth/sign-out-all').expect(401);
    await request(server).post('/api/auth/sign-out-all').set('Cookie', `${SESSION_COOKIE}=${a}`).expect(204);
    for (const token of [a, b]) await request(server).get('/api/auth/session').set('Cookie', `${SESSION_COOKIE}=${token}`).expect(401);
    const active = await db.select().from(schema.userSessions).where(isNull(schema.userSessions.revokedAt));
    expect(active).toEqual([]);
  });
});
