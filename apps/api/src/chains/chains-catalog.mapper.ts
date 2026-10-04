import { chainCapability, type ChainCapability } from '../database/schema/enums.js';
import type { chainCapabilities, chains, chainSmokeChecks } from '../database/schema/index.js';
import { EVM_CHAIN_DEFINITIONS } from './chain-definitions.js';
import type { ChainCapabilityView, ChainCatalogItem, SmokeCheckSummary, SmokeCheckView } from './chains-catalog.types.js';

type ChainRow = typeof chains.$inferSelect;
type CapabilityRow = typeof chainCapabilities.$inferSelect;
type CheckRow = typeof chainSmokeChecks.$inferSelect;

const ADAPTER_ORDER = new Map(EVM_CHAIN_DEFINITIONS.map((definition, index) => [definition.id, index]));

/** Urutan prioritas adapter di PRD dulu, lalu chain lain menurut keluarga dan id. */
export function compareChains(a: ChainRow, b: ChainRow): number {
  const orderA = ADAPTER_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const orderB = ADAPTER_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  return orderA - orderB || a.family.localeCompare(b.family) || a.id.localeCompare(b.id);
}

/** Pemeriksaan tersimpan; entri yang bentuknya tidak dikenal dilewati, tidak dikarang. */
export function toCheckViews(raw: unknown): SmokeCheckView[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): SmokeCheckView[] => {
    if (typeof item !== 'object' || item === null) return [];
    const value = item as Record<string, unknown>;
    if (typeof value.code !== 'string' || typeof value.ok !== 'boolean') return [];
    const level = value.level === 'rpc' || value.level === 'data' || value.level === 'optional' ? value.level : 'data';
    return [
      {
        code: value.code,
        provider: typeof value.provider === 'string' ? value.provider : '',
        level,
        ok: value.ok,
        detail: typeof value.detail === 'string' ? value.detail : '',
      },
    ];
  });
}

export function toCheckSummary(row: CheckRow): SmokeCheckSummary {
  const checks = toCheckViews(row.checks);
  return {
    id: row.id,
    testedAt: row.testedAt.toISOString(),
    status: row.status,
    passed: checks.filter((check) => check.ok).length,
    failed: checks.filter((check) => !check.ok && check.level !== 'optional').length,
    optionalFailed: checks.filter((check) => !check.ok && check.level === 'optional').length,
  };
}

/** Semua kemampuan, termasuk yang belum pernah diuji (selalu `planned`). */
export function toCapabilityViews(rows: readonly CapabilityRow[], checksById: ReadonlyMap<number, CheckRow>): ChainCapabilityView[] {
  const byCapability = new Map<ChainCapability, CapabilityRow>(rows.map((row) => [row.capability, row]));
  return chainCapability.enumValues.map((capability) => {
    const row = byCapability.get(capability);
    if (!row) return { capability, status: 'planned', source: null, reason: 'Belum pernah diuji lewat smoke test.', checkedAt: null };
    const check = row.checkId === null ? undefined : checksById.get(row.checkId);
    return { capability, status: row.status, source: row.source, reason: row.reason, checkedAt: check?.testedAt.toISOString() ?? null };
  });
}

export function toCatalogItem(chain: ChainRow, capabilities: readonly CapabilityRow[], checksById: ReadonlyMap<number, CheckRow>): ChainCatalogItem {
  const lastCheck = chain.supportCheckId === null ? undefined : checksById.get(chain.supportCheckId);
  return {
    id: chain.id,
    name: chain.name,
    family: chain.family,
    evmChainId: chain.evmChainId,
    nativeSymbol: chain.nativeSymbol,
    explorerUrl: chain.explorerUrl,
    supportStatus: chain.supportStatus,
    supported: chain.supportStatus === 'validated',
    hasAdapter: ADAPTER_ORDER.has(chain.id),
    lastCheck: lastCheck ? toCheckSummary(lastCheck) : null,
    capabilities: toCapabilityViews(capabilities, checksById),
  };
}
