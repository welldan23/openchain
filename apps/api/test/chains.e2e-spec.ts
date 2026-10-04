import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { SmokeCheck, SmokeTestReport } from '../src/chains/chain-adapter.types.js';
import { recordSmokeTest } from '../src/chains/chain-support-recorder.js';
import { CLOCK } from '../src/common/clock.js';
import { insertProviderRuns } from '../src/database/address-store.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import type { ProviderRunRecord } from '../src/providers/provider.types.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const check = (code: string, provider: string, ok: boolean, level: SmokeCheck['level'] = 'data'): SmokeCheck => ({
  code,
  provider,
  ok,
  level,
  detail: ok ? 'OK' : 'Belum ada indexer untuk chain ini',
});
const rpc = (provider: string) => ['rpc.chain_id', 'rpc.head', 'rpc.transaction', 'rpc.logs', 'rpc.call'].map((code) => check(code, provider, true, 'rpc'));
const NOW = new Date('2026-10-04T06:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);
const run = (provider: string, kind: ProviderRunRecord['kind'], failed: boolean, startedAt: Date, errorReason: string | null = null): ProviderRunRecord => ({
  key: `${provider}-${startedAt.toISOString()}`,
  provider,
  kind,
  operation: 'token.holders',
  subject: null,
  status: failed ? 'unavailable' : 'complete',
  errorReason: failed ? errorReason : null,
  missingFields: [],
  blockFrom: null,
  blockTo: null,
  startedAt,
  fetchedAt: failed ? null : startedAt,
});
const report = (chainId: string, status: SmokeTestReport['status'], checks: SmokeCheck[], testedAt: string): SmokeTestReport => ({
  chainId,
  status,
  checks,
  testedAt: new Date(testedAt),
});

describe('GET /api/chains', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const database = db as unknown as Database;
    await recordSmokeTest(
      database,
      report(
        'base',
        'validated',
        [
          ...rpc('base-rpc'),
          check('rpc.trace', 'base-rpc', false, 'optional'),
          check('explorer.contract', 'blockscout', true),
          check('indexer.holders', 'blockscout', true),
          check('market.pairs', 'dexscreener', true),
        ],
        '2026-10-03T04:00:00Z',
      ),
    );
    await recordSmokeTest(database, report('bsc', 'experimental', [...rpc('bsc-rpc'), check('indexer.holders', 'none', false)], '2026-10-03T04:05:00Z'));

    // Base: RPC sehat, indexer gagal terakhir kali (terganggu). Robinhood: indexer selalu diblokir.
    // Ethereum: hanya punya pengambilan lama di luar rentang 24 jam.
    await insertProviderRuns(database, 'base', [
      run('base-rpc', 'rpc', false, hoursAgo(3)),
      run('base-rpc', 'rpc', false, hoursAgo(1)),
      run('blockscout', 'indexed_data', false, hoursAgo(5)),
      run('blockscout', 'indexed_data', false, hoursAgo(4)),
      run('blockscout', 'indexed_data', true, hoursAgo(2), 'HTTP 429: kena batas rate provider'),
    ]);
    await insertProviderRuns(database, 'robinhood', [
      run('blockscout', 'indexed_data', true, hoursAgo(6), 'HTTP 403: diblokir proteksi bot (Cloudflare)'),
      run('blockscout', 'indexed_data', true, hoursAgo(1), 'HTTP 403: diblokir proteksi bot (Cloudflare)'),
    ]);
    await insertProviderRuns(database, 'ethereum', [run('ethereum-rpc', 'rpc', false, hoursAgo(48))]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => NOW })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it('mendaftar semua chain sesuai prioritas, dengan status, bukti smoke test, dan kemampuannya', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/chains').expect(200);
    expect(body.chains.map((chain: { id: string }) => chain.id).slice(0, 3)).toEqual(['robinhood', 'ethereum', 'base']);
    expect(body.summary).toEqual({ total: 12, validated: 1, experimental: 1, planned: 10 });
    const base = body.chains.find((chain: { id: string }) => chain.id === 'base');
    expect(base).toMatchObject({
      supportStatus: 'validated',
      supported: true,
      hasAdapter: true,
      lastCheck: { status: 'validated', passed: 8, failed: 0, optionalFailed: 1, testedAt: '2026-10-03T04:00:00.000Z' },
    });
    expect(base.capabilities).toHaveLength(8);
    expect(base.capabilities.find((cap: { capability: string }) => cap.capability === 'holders')).toEqual({
      capability: 'holders',
      status: 'validated',
      source: 'blockscout',
      reason: null,
      checkedAt: '2026-10-03T04:00:00.000Z',
    });
    expect(base.capabilities.find((cap: { capability: string }) => cap.capability === 'fund_flow')).toMatchObject({ status: 'experimental' });

    const robinhood = body.chains.find((chain: { id: string }) => chain.id === 'robinhood');
    expect(robinhood).toMatchObject({ supportStatus: 'planned', supported: false, hasAdapter: true, lastCheck: null });
    expect(robinhood.capabilities.every((cap: { status: string; reason: string }) => cap.status === 'planned' && cap.reason.includes('Belum pernah diuji'))).toBe(true);
    expect(body.chains.find((chain: { id: string }) => chain.id === 'solana')).toMatchObject({ family: 'solana', hasAdapter: false, evmChainId: null });
    expect(body.caveats[0]).toContain('smoke test tersimpan');
  });

  it('menyaring menurut keluarga, status, dan kemampuan', async () => {
    const server = app.getHttpServer();
    const solana = await request(server).get('/api/chains?family=solana').expect(200);
    expect(solana.body.chains.map((chain: { id: string }) => chain.id)).toEqual(['solana']);
    const validated = await request(server).get('/api/chains?status=validated').expect(200);
    expect(validated.body.chains.map((chain: { id: string }) => chain.id)).toEqual(['base']);
    const flows = await request(server).get('/api/chains?capability=fund_flow').expect(200);
    expect(flows.body.chains.map((chain: { id: string }) => chain.id)).toEqual(['base']);
    const snapshots = await request(server).get('/api/chains?capability=token_snapshot').expect(200);
    expect(snapshots.body.chains.map((chain: { id: string }) => chain.id)).toEqual(['base', 'bsc']);
    await request(server).get('/api/chains?status=didukung').expect(400);
    await request(server).get('/api/chains?capability=nft').expect(400);
    await request(server).get('/api/chains?family=cosmos').expect(400);
  });

  it('status ketersediaan per chain dan per provider dari riwayat pengambilan', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/chains/availability').expect(200);
    expect(body.window).toEqual({ from: hoursAgo(24).toISOString(), to: NOW.toISOString(), hours: 24 });
    const byId = Object.fromEntries(body.chains.map((item: { chain: { id: string } }) => [item.chain.id, item]));
    expect(byId.base.status).toBe('degraded');
    expect(byId.base.providers).toEqual([
      expect.objectContaining({ provider: 'blockscout', kind: 'indexed_data', status: 'degraded', runs: 3, failures: 1, failureRatePct: 33.33, lastFailureReason: 'HTTP 429: kena batas rate provider' }),
      expect.objectContaining({ provider: 'base-rpc', kind: 'rpc', status: 'available', runs: 2, failures: 0, lastSuccessAt: hoursAgo(1).toISOString(), lastFailureAt: null }),
    ]);
    expect(byId.robinhood).toMatchObject({ status: 'unavailable', providers: [expect.objectContaining({ status: 'unavailable', lastSuccessAt: null })] });
    expect(byId.ethereum).toMatchObject({ status: 'unknown', providers: [] });
    expect(byId.solana.status).toBe('unknown');
    expect(body.caveats[0]).toContain('bukan berarti mati');

    const wider = await request(app.getHttpServer()).get('/api/chains/availability?hours=72').expect(200);
    expect(wider.body.chains.find((item: { chain: { id: string } }) => item.chain.id === 'ethereum').status).toBe('available');
    await request(app.getHttpServer()).get('/api/chains/availability?hours=0').expect(400);
    await request(app.getHttpServer()).get('/api/chains/availability?hours=169').expect(400);

    const detail = await request(app.getHttpServer()).get('/api/chains/base').expect(200);
    expect(detail.body.availability).toEqual(byId.base);
  });

  it('detail chain memuat pemeriksaan terakhir dan riwayatnya', async () => {
    await recordSmokeTest(db as unknown as Database, report('bsc', 'planned', [check('rpc.chain_id', 'bsc-rpc', false, 'rpc')], '2026-10-04T04:00:00Z'));
    const { body } = await request(app.getHttpServer()).get('/api/chains/bsc').expect(200);
    expect(body.chain).toMatchObject({ id: 'bsc', supportStatus: 'planned', lastCheck: { status: 'planned', failed: 1 } });
    expect(body.checks).toEqual([{ code: 'rpc.chain_id', provider: 'bsc-rpc', level: 'rpc', ok: false, detail: 'Belum ada indexer untuk chain ini' }]);
    expect(body.history.map((item: { status: string }) => item.status)).toEqual(['planned', 'experimental']);

    const solana = await request(app.getHttpServer()).get('/api/chains/solana').expect(200);
    expect(solana.body).toMatchObject({ checks: [], history: [] });
    expect(solana.body.caveats.join(' ')).toContain('belum pernah diuji');
    await request(app.getHttpServer()).get('/api/chains/mars').expect(404);
  });
});
