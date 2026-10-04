import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../../test/support/database.js';
import type { Database } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import type { SmokeCheck, SmokeTestReport } from './chain-adapter.types.js';
import { capabilitiesFromSmoke, recordSmokeTest } from './chain-support-recorder.js';

const TESTED_AT = new Date('2026-10-04T05:00:00Z');
const check = (code: string, provider: string, ok: boolean, level: SmokeCheck['level'] = 'data'): SmokeCheck => ({
  code,
  provider,
  ok,
  level,
  detail: ok ? 'OK' : `${code} gagal`,
});
const RPC = ['rpc.chain_id', 'rpc.head', 'rpc.transaction', 'rpc.logs', 'rpc.call'].map((code) => check(code, 'base-rpc', true, 'rpc'));
const report = (status: SmokeTestReport['status'], checks: SmokeCheck[]): SmokeTestReport => ({ chainId: 'base', status, checks, testedAt: TESTED_AT });

describe('capabilitiesFromSmoke', () => {
  it('kemampuan yang pemeriksaannya lulus jadi validated; aliran dana paling tinggi experimental', () => {
    const result = capabilitiesFromSmoke(
      report('validated', [
        ...RPC,
        check('rpc.trace', 'base-rpc', false, 'optional'),
        check('explorer.contract', 'blockscout', true),
        check('indexer.holders', 'blockscout', true),
        check('market.pairs', 'dexscreener', true),
        check('security.goplus', 'goplus', true, 'optional'),
        check('security.honeypotis', 'honeypot.is', false, 'optional'),
      ]),
    );
    expect(result.map((item) => [item.capability, item.status, item.source])).toEqual([
      ['token_snapshot', 'validated', 'base-rpc'],
      ['holders', 'validated', 'blockscout'],
      ['contract_info', 'validated', 'blockscout'],
      ['market_data', 'validated', 'dexscreener'],
      ['contract_security', 'validated', 'goplus'],
      ['fund_flow', 'experimental', 'blockscout'],
      ['internal_traces', 'planned', null],
      ['multichain_profile', 'experimental', 'blockscout'],
    ]);
    expect(result.find((item) => item.capability === 'internal_traces')?.reason).toBe('rpc.trace gagal');
    expect(result.find((item) => item.capability === 'fund_flow')?.reason).toContain('belum punya smoke test sendiri');
  });

  it('tanpa indexer, holder dan aliran dana tetap planned dengan alasannya', () => {
    const result = capabilitiesFromSmoke(report('experimental', [...RPC, check('indexer.holders', 'tidak ada', false)]));
    const status = Object.fromEntries(result.map((item) => [item.capability, item.status]));
    expect(status).toMatchObject({ token_snapshot: 'validated', holders: 'planned', fund_flow: 'planned', multichain_profile: 'planned', contract_security: 'planned' });
    expect(result.find((item) => item.capability === 'contract_info')?.reason).toBe('Explorer belum diperiksa.');
  });

  it('RPC yang gagal membuat snapshot token planned', () => {
    const [snapshot] = capabilitiesFromSmoke(report('planned', [check('rpc.chain_id', 'base-rpc', false, 'rpc')]));
    expect(snapshot).toMatchObject({ capability: 'token_snapshot', status: 'planned', reason: 'rpc.chain_id gagal' });
  });
});

describe('recordSmokeTest', () => {
  let client: PGlite;
  let db: TestDatabase;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('menyimpan smoke test sebagai bukti, lalu status chain dan kemampuan menunjuk ke situ', async () => {
    const first = await recordSmokeTest(
      db as unknown as Database,
      report('validated', [...RPC, check('explorer.contract', 'blockscout', true), check('indexer.holders', 'blockscout', true), check('market.pairs', 'dexscreener', true)]),
    );
    const [chain] = await db.select().from(schema.chains).where(eq(schema.chains.id, 'base'));
    expect(chain).toMatchObject({ supportStatus: 'validated', supportCheckId: first.checkId });
    const [stored] = await db.select().from(schema.chainSmokeChecks).where(eq(schema.chainSmokeChecks.id, first.checkId));
    expect(stored.checks).toHaveLength(8);
    expect(await db.select().from(schema.chainCapabilities).where(eq(schema.chainCapabilities.chainId, 'base'))).toHaveLength(8);

    // Smoke test berikutnya yang gagal menurunkan status, dengan bukti barunya; kemampuan tidak digandakan.
    const second = await recordSmokeTest(db as unknown as Database, report('planned', [check('rpc.chain_id', 'base-rpc', false, 'rpc')]));
    const [after] = await db.select().from(schema.chains).where(eq(schema.chains.id, 'base'));
    expect(after).toMatchObject({ supportStatus: 'planned', supportCheckId: second.checkId });
    const capabilities = await db.select().from(schema.chainCapabilities).where(eq(schema.chainCapabilities.chainId, 'base'));
    expect(capabilities).toHaveLength(8);
    expect(capabilities.every((item) => item.status === 'planned' && item.checkId === second.checkId)).toBe(true);
    expect(await db.select().from(schema.chainSmokeChecks)).toHaveLength(2);
  });
});
