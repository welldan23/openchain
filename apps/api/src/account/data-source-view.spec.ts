import { EVM_CHAIN_DEFINITIONS } from '../chains/chain-definitions.js';
import { envVarConfigured, healthStatus, serverDisabledReason, sourceChains, toDataSourceView, type DataSourceRow, type SourceRunStats, type ViewContext } from './data-source-view.js';

const AT = new Date('2026-10-03T05:00:00Z');
const context: ViewContext = { definitions: EVM_CHAIN_DEFINITIONS, validatedChains: ['ethereum', 'base', 'arbitrum'], env: {}, windowHours: 24 };
const runs = (values: Partial<SourceRunStats>): SourceRunStats => ({
  runs: 4,
  failures: 0,
  lastStatusFailed: false,
  lastRunAt: AT,
  lastSuccessAt: AT,
  lastFailureAt: null,
  lastFailureReason: null,
  ...values,
});
const source = (values: Partial<DataSourceRow>): DataSourceRow => ({
  id: 'dexscreener',
  name: 'Dexscreener',
  kind: 'market_data',
  description: 'Harga dan likuiditas.',
  integrated: true,
  required: false,
  lockedReason: null,
  offEffect: 'Harga ditandai tidak tersedia.',
  attribution: null,
  envVars: [],
  ...values,
});

describe('kondisi sumber data', () => {
  it('dari pengambilan data: tanpa catatan unknown, bukan normal', () => {
    expect(healthStatus(runs({ runs: 0, lastRunAt: null, lastSuccessAt: null }))).toBe('unknown');
    expect(healthStatus(runs({}))).toBe('ok');
    expect(healthStatus(runs({ failures: 1, lastStatusFailed: true, lastFailureAt: AT }))).toBe('degraded');
    expect(healthStatus(runs({ failures: 4, lastStatusFailed: true, lastSuccessAt: null }))).toBe('down');
  });

  it('nyala: status dan catatan dari pengambilan data; chain hanya yang tervalidasi', () => {
    const view = toDataSourceView(source({}), runs({ failures: 1, lastFailureAt: AT, lastFailureReason: 'HTTP 429' }), undefined, context);
    expect(view).toMatchObject({ kind: 'market', status: 'ok', enabled: true, lockedReason: null, lastCheckedAt: AT.toISOString() });
    expect(view.statusNote).toBe('3 dari 4 pengambilan dalam 24 jam terakhir berhasil.');
    expect(view.chains).toEqual(['ethereum', 'base', 'arbitrum']);
    const unknown = toDataSourceView(source({}), undefined, undefined, context);
    expect(unknown).toMatchObject({ status: 'unknown', lastCheckedAt: null, health: { status: 'unknown', runs: 0 } });
    expect(unknown.statusNote).toContain('bukan berarti normal');
    const down = toDataSourceView(source({}), runs({ failures: 4, lastStatusFailed: true, lastSuccessAt: null, lastFailureReason: 'batas waktu habis' }), undefined, context);
    expect(down.statusNote).toBe('Semua 4 pengambilan dalam 24 jam terakhir gagal. Gagal terakhir: batas waktu habis');
  });

  it('dimatikan akun: status disabled, kondisi pengambilan tetap dilaporkan', () => {
    const view = toDataSourceView(source({}), runs({}), false, context);
    expect(view).toMatchObject({ status: 'disabled', enabled: false, statusNote: 'Dimatikan untuk akun ini.', health: { status: 'ok' } });
  });

  it('wajib selalu nyala dan terkunci; belum terhubung tidak bisa dinyalakan', () => {
    const rpc = toDataSourceView(source({ id: 'rpc', kind: 'rpc', required: true, lockedReason: 'Wajib.' }), runs({}), false, context);
    expect(rpc).toMatchObject({ status: 'ok', enabled: true, lockedReason: 'Wajib.' });
    const insightx = toDataSourceView(source({ id: 'insightx', kind: 'entity_label', integrated: false, lockedReason: 'Belum terhubung.' }), undefined, true, context);
    expect(insightx).toMatchObject({ kind: 'label', status: 'not_integrated', enabled: false, health: null, chains: [], lastCheckedAt: null });
  });

  it('penyedia keamanan yang dimatikan server terkunci dan tidak mencakup chain apa pun', () => {
    const env = { SECURITY_PROVIDERS: 'goplus' };
    expect(serverDisabledReason('goplus', env)).toBeNull();
    expect(serverDisabledReason('honeypotis', env)).toContain('SECURITY_PROVIDERS');
    expect(serverDisabledReason('honeypotis', {})).toBeNull();
    expect(sourceChains('honeypotis', EVM_CHAIN_DEFINITIONS, env)).toEqual([]);
    const view = toDataSourceView(source({ id: 'honeypotis', kind: 'security' }), runs({}), true, { ...context, env });
    expect(view).toMatchObject({ status: 'disabled', enabled: false, chains: [] });
    expect(view.lockedReason).toContain('SECURITY_PROVIDERS');
  });

  it('cakupan chain dari definisi adapter', () => {
    expect(sourceChains('rpc', EVM_CHAIN_DEFINITIONS, {})).toEqual(EVM_CHAIN_DEFINITIONS.map((item) => item.id));
    expect(sourceChains('honeypotis', EVM_CHAIN_DEFINITIONS, {})).toEqual(EVM_CHAIN_DEFINITIONS.filter((item) => item.securityProviders.includes('honeypotis')).map((item) => item.id));
    expect(sourceChains('insightx', EVM_CHAIN_DEFINITIONS, {})).toEqual([]);
  });

  it('environment variable hanya dilaporkan terisi atau belum, nilainya tidak ikut', () => {
    const env = { BLOCKSCOUT_API_KEY: 'kunci-rahasia', RPC_URL_BASE: 'https://rpc.contoh', SECURITY_PROVIDERS: '  ' };
    expect(envVarConfigured('BLOCKSCOUT_API_KEY', env, ['base'])).toBe(true);
    expect(envVarConfigured('RPC_URL_<CHAIN>', env, ['ethereum', 'base'])).toBe(true);
    expect(envVarConfigured('RPC_URL_<CHAIN>', env, ['ethereum'])).toBe(false);
    expect(envVarConfigured('SECURITY_PROVIDERS', env, [])).toBe(false);
    const view = toDataSourceView(
      source({ id: 'blockscout', kind: 'explorer', required: true, lockedReason: 'Wajib.', envVars: [{ name: 'BLOCKSCOUT_API_KEY', purpose: 'PRO API.', required: false }] }),
      runs({}),
      undefined,
      { ...context, env },
    );
    expect(view.envVars).toEqual([{ name: 'BLOCKSCOUT_API_KEY', purpose: 'PRO API.', required: false, configured: true }]);
    expect(JSON.stringify(view)).not.toContain('kunci-rahasia');
  });
});
