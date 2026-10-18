/**
 * Bentuk sumber data untuk halaman pengaturan, murni. Kondisi dihitung dari
 * `provider_runs` (logika yang sama dengan `/api/chains/availability`);
 * tanpa pengambilan dalam rentang waktu, kondisinya `unknown`, bukan dianggap
 * normal. Chain yang dicakup dibaca dari definisi adapter dan konfigurasi
 * server, dan hanya chain yang sudah lolos smoke test yang disebut.
 * Environment variable hanya dilaporkan sudah diisi atau belum, tidak pernah
 * nilainya. Saklar per akun baru disimpan; halaman analisis belum memakainya
 * (dicatat di `DATA_SOURCE_CAVEATS`).
 */
import { providerStatus, type ProviderRunStats } from '../chains/chain-availability.js';
import { blockscoutEnvVar, type EvmChainDefinition, type SecurityProviderId } from '../chains/chain-definitions.js';
import type { DataSourceEnvVar } from '../database/schema/data-sources.js';
import type { ProviderKind } from '../database/schema/enums.js';

export type DataSourceKind = 'rpc' | 'explorer' | 'market' | 'security' | 'label';
/** `unknown`: belum ada pengambilan dalam rentang waktu, jadi kondisinya belum diketahui. */
export type DataSourceStatus = 'ok' | 'degraded' | 'down' | 'unknown' | 'disabled' | 'not_integrated';
export type HealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export type Env = Readonly<Record<string, string | undefined>>;

export const DATA_SOURCE_CAVEATS = [
  'Kondisi dihitung dari pengambilan data yang benar-benar dijalankan; tanpa pengambilan dalam rentang ini kondisinya unknown, bukan berarti normal.',
  'Saklar sumber data baru disimpan per akun. Halaman analisis belum memakainya, jadi data dari sumber yang dimatikan masih bisa tampil di sana.',
  'Environment variable hanya dilaporkan sudah diisi atau belum; nilainya tidak pernah dikirim.',
];

export interface DataSourceRow {
  id: string;
  name: string;
  kind: ProviderKind;
  description: string;
  integrated: boolean;
  required: boolean;
  lockedReason: string | null;
  offEffect: string;
  attribution: string | null;
  envVars: DataSourceEnvVar[];
}

export interface SourceRunStats {
  runs: number;
  failures: number;
  lastStatusFailed: boolean;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
}

export interface DataSourceView {
  id: string;
  name: string;
  kind: DataSourceKind;
  description: string;
  chains: string[];
  /** Kondisi yang berlaku untuk akun ini (memperhitungkan saklar). */
  status: DataSourceStatus;
  statusNote: string;
  /** Kondisi dari pengambilan data terakhir, terlepas dari saklar akun; `null` bila belum terhubung. */
  health: {
    status: HealthStatus;
    runs: number;
    failures: number;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    /** Alasan kegagalan terakhir; disimpan tanpa URL atau API key. */
    lastFailureReason: string | null;
  } | null;
  envVars: Array<DataSourceEnvVar & { configured: boolean }>;
  lastCheckedAt: string | null;
  enabled: boolean;
  lockedReason: string | null;
  offEffect: string;
  attribution: string | null;
}

const KIND: Record<ProviderKind, DataSourceKind> = {
  rpc: 'rpc',
  explorer: 'explorer',
  indexed_data: 'explorer',
  market_data: 'market',
  security: 'security',
  entity_label: 'label',
};

const SECURITY_IDS: readonly SecurityProviderId[] = ['goplus', 'honeypotis'];
const isSecurityId = (id: string): id is SecurityProviderId => (SECURITY_IDS as readonly string[]).includes(id);

const set = (env: Env, name: string) => Boolean(env[name]?.trim());
const chainVar = (prefix: string, chainId: string) => `${prefix}${chainId.toUpperCase().replace(/-/g, '_')}`;

/** Penyedia keamanan yang dimatikan server lewat `SECURITY_PROVIDERS`. */
export function serverDisabledReason(sourceId: string, env: Env): string | null {
  if (!isSecurityId(sourceId) || !set(env, 'SECURITY_PROVIDERS')) return null;
  const enabled = new Set(env.SECURITY_PROVIDERS!.split(',').map((id) => id.trim().toLowerCase()));
  return enabled.has(sourceId) ? null : 'Dimatikan di server lewat SECURITY_PROVIDERS; hanya bisa dinyalakan dari konfigurasi server.';
}

/** Chain yang dilayani sumber ini menurut definisi adapter dan konfigurasi server (belum disaring status chain). */
export function sourceChains(sourceId: string, definitions: readonly EvmChainDefinition[], env: Env): string[] {
  if (sourceId === 'rpc') return definitions.map((item) => item.id);
  if (sourceId === 'blockscout') return definitions.filter((item) => item.blockscout !== null || set(env, blockscoutEnvVar(item.id))).map((item) => item.id);
  if (sourceId === 'dexscreener') return definitions.filter((item) => item.dexscreenerSlug !== null).map((item) => item.id);
  if (isSecurityId(sourceId)) return serverDisabledReason(sourceId, env) ? [] : definitions.filter((item) => item.securityProviders.includes(sourceId)).map((item) => item.id);
  return [];
}

/** Variabel ber-`<CHAIN>` dianggap terisi bila diisi untuk salah satu chain. Nilainya tidak pernah dibaca keluar. */
export function envVarConfigured(name: string, env: Env, chainIds: readonly string[]): boolean {
  if (!name.includes('<CHAIN>')) return set(env, name);
  const prefix = name.slice(0, name.indexOf('<CHAIN>'));
  return chainIds.some((chainId) => set(env, chainVar(prefix, chainId)));
}

export function healthStatus(stats: SourceRunStats): HealthStatus {
  const status = providerStatus({ ...stats, provider: '', kind: '' } satisfies ProviderRunStats);
  return status === 'available' ? 'ok' : status === 'unavailable' ? 'down' : status;
}

function healthNote(status: HealthStatus, stats: SourceRunStats, hours: number): string {
  const reason = stats.lastFailureReason ? ` Gagal terakhir: ${stats.lastFailureReason}` : '';
  if (status === 'unknown') return `Belum ada pengambilan data dalam ${hours} jam terakhir, jadi kondisinya belum diketahui (bukan berarti normal).`;
  if (status === 'down') return `Semua ${stats.runs} pengambilan dalam ${hours} jam terakhir gagal.${reason}`;
  if (status === 'degraded') return `${stats.failures} dari ${stats.runs} pengambilan dalam ${hours} jam terakhir gagal${stats.lastStatusFailed ? ', termasuk yang terakhir' : ''}.${reason}`;
  return stats.failures === 0
    ? `${stats.runs} pengambilan dalam ${hours} jam terakhir berhasil.`
    : `${stats.runs - stats.failures} dari ${stats.runs} pengambilan dalam ${hours} jam terakhir berhasil.`;
}

export interface ViewContext {
  definitions: readonly EvmChainDefinition[];
  /** Chain yang sudah lolos smoke test, urut prioritas adapter. */
  validatedChains: readonly string[];
  env: Env;
  windowHours: number;
}

/** Alasan sumber tidak bisa diatur akun ini, atau `null` bila bebas. */
export function lockReason(source: DataSourceRow, env: Env): string | null {
  return source.lockedReason ?? serverDisabledReason(source.id, env);
}

export function toDataSourceView(source: DataSourceRow, stats: SourceRunStats | undefined, userEnabled: boolean | undefined, context: ViewContext): DataSourceView {
  const covered = new Set(sourceChains(source.id, context.definitions, context.env));
  const allChains = context.definitions.map((item) => item.id);
  const base = {
    id: source.id,
    name: source.name,
    kind: KIND[source.kind],
    description: source.description,
    chains: context.validatedChains.filter((chainId) => covered.has(chainId)),
    envVars: source.envVars.map((item) => ({ ...item, configured: envVarConfigured(item.name, context.env, allChains) })),
    offEffect: source.offEffect,
    attribution: source.attribution,
  };
  if (!source.integrated) {
    return { ...base, status: 'not_integrated', statusNote: 'Belum terhubung, jadi tidak ada data dari sumber ini.', health: null, lastCheckedAt: null, enabled: false, lockedReason: source.lockedReason };
  }
  const runs: SourceRunStats = stats ?? { runs: 0, failures: 0, lastStatusFailed: false, lastRunAt: null, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null };
  const status = healthStatus(runs);
  const health = {
    status,
    runs: runs.runs,
    failures: runs.failures,
    lastSuccessAt: runs.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: runs.lastFailureAt?.toISOString() ?? null,
    lastFailureReason: runs.lastFailureReason,
  };
  const serverOff = serverDisabledReason(source.id, context.env);
  const enabled = source.required || (!serverOff && userEnabled !== false);
  const common = { ...base, health, lastCheckedAt: runs.lastRunAt?.toISOString() ?? null, enabled, lockedReason: lockReason(source, context.env) };
  if (serverOff) return { ...common, status: 'disabled', statusNote: serverOff };
  if (!enabled) return { ...common, status: 'disabled', statusNote: 'Dimatikan untuk akun ini.' };
  return { ...common, status, statusNote: healthNote(status, runs, context.windowHours) };
}
