import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SERVER_ENV } from '../src/account/data-sources.service.js';
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
      .overrideProvider(SERVER_ENV)
      .useValue({ SECURITY_PROVIDERS: 'goplus', BLOCKSCOUT_API_KEY: 'kunci-uji-rahasia' })
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
    await request(server).get('/api/account/preferences').expect(401);
    await request(server).patch('/api/account/preferences').send({ theme: 'light' }).expect(401);
    await request(server).get('/api/account/data-sources').expect(401);
    await request(server).patch('/api/account/data-sources/dexscreener').send({ enabled: false }).expect(401);
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

  it('preferensi tampilan: bawaan, simpan sebagian, chain bawaan hanya yang tervalidasi', async () => {
    const server = app.getHttpServer();
    // Ethereum dan Base dianggap sudah lolos smoke test; Robinhood masih eksperimental.
    for (const [chain, status] of [
      ['ethereum', 'validated'],
      ['base', 'validated'],
      ['robinhood', 'experimental'],
    ]) {
      const check = await client.query<{ id: number }>(`INSERT INTO chain_smoke_checks (chain_id, status, checks, tested_at) VALUES ($1, $2, '[]', now()) RETURNING id`, [chain, status]);
      await client.query(`UPDATE chains SET support_status = $2, support_check_id = $3 WHERE id = $1`, [chain, status, check.rows[0].id]);
    }

    const initial = await request(server).get('/api/account/preferences').set('Cookie', cookie).expect(200);
    expect(initial.headers['cache-control']).toBe('no-store');
    expect(initial.body).toEqual({
      theme: 'dark',
      language: 'id',
      numberLocale: 'id',
      timeDisplay: 'local',
      compactNumbers: true,
      valueUnit: 'usd',
      defaultChain: 'ethereum',
      defaultChainSource: 'fallback',
      defaultChainNote: 'Belum memilih chain bawaan; memakai Ethereum.',
      density: 'comfortable',
      updatedAt: expect.any(String),
    });

    now = new Date('2026-10-03T08:00:00Z');
    const saved = await request(server).patch('/api/account/preferences').set('Cookie', cookie).send({ theme: 'light', compactNumbers: false, defaultChain: 'base' }).expect(200);
    expect(saved.body).toMatchObject({ theme: 'light', compactNumbers: false, language: 'id', defaultChain: 'base', defaultChainSource: 'chosen', defaultChainNote: null, updatedAt: now.toISOString() });
    const reread = await request(server).get('/api/account/preferences').set('Cookie', cookie).expect(200);
    expect(reread.body).toEqual(saved.body);

    await request(server).patch('/api/account/preferences').set('Cookie', cookie).send({ language: 'en' }).expect(400);
    await request(server).patch('/api/account/preferences').set('Cookie', cookie).send({ theme: 'sepia' }).expect(400);
    const experimental = await request(server).patch('/api/account/preferences').set('Cookie', cookie).send({ defaultChain: 'robinhood' }).expect(400);
    expect(experimental.body.message).toContain('belum didukung penuh');
    await request(server).patch('/api/account/preferences').set('Cookie', cookie).send({ defaultChain: 'cardano' }).expect(400);

    // Bila chain pilihan turun status, chain tervalidasi pertama dipakai dan alasannya dijelaskan.
    await client.query(`UPDATE chains SET support_status = 'experimental' WHERE id = 'base'`);
    const degraded = await request(server).get('/api/account/preferences').set('Cookie', cookie).expect(200);
    expect(degraded.body).toMatchObject({ defaultChain: 'ethereum', defaultChainSource: 'fallback', defaultChainNote: 'Base sedang tidak tervalidasi (status experimental); sementara memakai Ethereum.' });

    const cleared = await request(server).patch('/api/account/preferences').set('Cookie', cookie).send({ defaultChain: null }).expect(200);
    expect(cleared.body).toMatchObject({ theme: 'light', defaultChain: 'ethereum', defaultChainSource: 'fallback' });
  });

  it('sumber data: kondisi dari pengambilan data, saklar per akun, sumber terkunci 409', async () => {
    const server = app.getHttpServer();
    now = new Date('2026-10-03T10:00:00Z');
    await client.query(`UPDATE chains SET support_status = 'planned', support_check_id = NULL`);
    const check = await client.query<{ id: number }>(`INSERT INTO chain_smoke_checks (chain_id, status, checks, tested_at) VALUES ('base', 'validated', '[]', now()) RETURNING id`);
    await client.query(`UPDATE chains SET support_status = 'validated', support_check_id = $1 WHERE id = 'base'`, [check.rows[0].id]);
    const run = `INSERT INTO provider_runs (provider, kind, chain_id, operation, status, error_reason, started_at) VALUES ($1, $2, 'base', 'uji', $3, $4, $5)`;
    await client.query(run, ['dexscreener', 'market_data', 'complete', null, '2026-10-03T09:00:00Z']);
    await client.query(run, ['dexscreener', 'market_data', 'unavailable', 'HTTP 429 dari provider', '2026-10-03T09:30:00Z']);
    await client.query(run, ['base-rpc', 'rpc', 'complete', null, '2026-10-03T09:10:00Z']);
    // Di luar rentang 24 jam: tidak dihitung.
    await client.query(run, ['goplus', 'security', 'complete', null, '2026-10-01T09:00:00Z']);

    const { body, headers } = await request(server).get('/api/account/data-sources').set('Cookie', cookie).expect(200);
    expect(headers['cache-control']).toBe('no-store');
    expect(body.window).toEqual({ from: '2026-10-02T10:00:00.000Z', to: now.toISOString(), hours: 24 });
    expect(JSON.stringify(body)).not.toContain('kunci-uji-rahasia');
    const byId = Object.fromEntries((body.sources as Array<{ id: string }>).map((item) => [item.id, item])) as Record<string, Record<string, unknown>>;
    expect(Object.keys(byId)).toEqual(['rpc', 'blockscout', 'dexscreener', 'goplus', 'honeypotis', 'insightx']);
    expect(byId.rpc).toMatchObject({ kind: 'rpc', status: 'ok', enabled: true, chains: ['base'], lastCheckedAt: '2026-10-03T09:10:00.000Z' });
    expect(byId.dexscreener).toMatchObject({ kind: 'market', status: 'degraded', enabled: true, lockedReason: null, health: { runs: 2, failures: 1, lastFailureReason: 'HTTP 429 dari provider' } });
    expect(byId.goplus).toMatchObject({ status: 'unknown', attribution: 'Powered by GoPlus', health: { runs: 0 } });
    expect(byId.honeypotis).toMatchObject({ status: 'disabled', enabled: false, chains: [] });
    expect(byId.insightx).toMatchObject({ kind: 'label', status: 'not_integrated', enabled: false, health: null });
    expect(byId.blockscout.envVars).toEqual([
      { name: 'BLOCKSCOUT_API_KEY', purpose: expect.any(String), required: false, configured: true },
      { name: 'BLOCKSCOUT_URL_<CHAIN>', purpose: expect.any(String), required: false, configured: false },
    ]);

    const off = await request(server).patch('/api/account/data-sources/dexscreener').set('Cookie', cookie).send({ enabled: false }).expect(200);
    expect(off.body).toMatchObject({ id: 'dexscreener', status: 'disabled', enabled: false, health: { status: 'degraded' } });
    const reread = await request(server).get('/api/account/data-sources').set('Cookie', cookie).expect(200);
    expect(reread.body.sources.find((item: { id: string }) => item.id === 'dexscreener')).toMatchObject({ enabled: false, status: 'disabled' });
    const on = await request(server).patch('/api/account/data-sources/dexscreener').set('Cookie', cookie).send({ enabled: true }).expect(200);
    expect(on.body).toMatchObject({ enabled: true, status: 'degraded' });

    const rpc = await request(server).patch('/api/account/data-sources/rpc').set('Cookie', cookie).send({ enabled: false }).expect(409);
    expect(rpc.body.message).toBe('RPC chain tidak bisa diubah. Wajib: blok, transaksi, dan log on-chain berasal dari sini.');
    await request(server).patch('/api/account/data-sources/insightx').set('Cookie', cookie).send({ enabled: true }).expect(409);
    await request(server).patch('/api/account/data-sources/honeypotis').set('Cookie', cookie).send({ enabled: true }).expect(409);
    await request(server).patch('/api/account/data-sources/arkham').set('Cookie', cookie).send({ enabled: true }).expect(404);
    await request(server).patch('/api/account/data-sources/goplus').set('Cookie', cookie).send({ enabled: 'tidak' }).expect(400);
  });
});
