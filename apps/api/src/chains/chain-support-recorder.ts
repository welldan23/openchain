/**
 * Menyimpan hasil smoke test sebagai bukti status dukungan chain.
 *
 * Satu smoke test disimpan utuh (`chain_smoke_checks`), lalu status chain dan
 * status tiap kemampuan datanya menunjuk ke situ. Kemampuan hanya `validated`
 * bila pemeriksaannya sendiri lulus; kemampuan yang belum punya pemeriksaan
 * sendiri paling tinggi `experimental`, dengan alasan yang jelas.
 */
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import type { ChainCapability, ChainSupportStatus } from '../database/schema/enums.js';
import { chainCapabilities, chains, chainSmokeChecks } from '../database/schema/index.js';
import type { SmokeCheck, SmokeTestReport } from './chain-adapter.types.js';

export interface CapabilityStatus {
  capability: ChainCapability;
  status: ChainSupportStatus;
  /** Provider yang dipakai; `null` bila belum ada. */
  source: string | null;
  reason: string | null;
}

function fromCheck(capability: ChainCapability, check: SmokeCheck | undefined, missing: string): CapabilityStatus {
  if (!check) return { capability, status: 'planned', source: null, reason: missing };
  return check.ok
    ? { capability, status: 'validated', source: check.provider, reason: null }
    : { capability, status: 'planned', source: null, reason: check.detail };
}

/** Status tiap kemampuan data menurut hasil smoke test. */
export function capabilitiesFromSmoke(report: SmokeTestReport): CapabilityStatus[] {
  const byCode = new Map(report.checks.map((check) => [check.code, check]));
  const rpcChecks = report.checks.filter((check) => check.level === 'rpc');
  const rpcFailed = rpcChecks.find((check) => !check.ok);
  const tokenSnapshot: CapabilityStatus =
    rpcChecks.length > 0 && !rpcFailed
      ? { capability: 'token_snapshot', status: 'validated', source: rpcChecks[0].provider, reason: null }
      : { capability: 'token_snapshot', status: 'planned', source: null, reason: rpcFailed?.detail ?? 'RPC belum diperiksa.' };

  const holders = fromCheck('holders', byCode.get('indexer.holders'), 'Indexer holder belum diperiksa.');
  const security = report.checks.filter((check) => check.code.startsWith('security.'));
  const securityOk = security.filter((check) => check.ok);
  const contractSecurity: CapabilityStatus =
    securityOk.length > 0
      ? { capability: 'contract_security', status: 'validated', source: securityOk.map((check) => check.provider).join(', '), reason: null }
      : {
          capability: 'contract_security',
          status: 'planned',
          source: null,
          reason: security.length > 0 ? security.map((check) => check.detail).join('; ') : 'Belum ada penyedia analisis keamanan untuk chain ini.',
        };

  // Aliran dana memakai indexer yang sama dengan holder, tapi belum punya pemeriksaan sendiri.
  const flowReason = 'Memakai indexer yang sama dengan daftar holder; aliran dana belum punya smoke test sendiri.';
  const fundFlow: CapabilityStatus =
    holders.status === 'validated'
      ? { capability: 'fund_flow', status: 'experimental', source: holders.source, reason: flowReason }
      : { capability: 'fund_flow', status: 'planned', source: null, reason: 'Belum ada indexer riwayat transfer yang lolos pemeriksaan.' };
  const multichain: CapabilityStatus =
    fundFlow.status === 'planned'
      ? { capability: 'multichain_profile', status: 'planned', source: null, reason: fundFlow.reason }
      : { capability: 'multichain_profile', status: 'experimental', source: fundFlow.source, reason: 'Bergantung pada aliran dana, yang masih eksperimental.' };

  return [
    tokenSnapshot,
    holders,
    fromCheck('contract_info', byCode.get('explorer.contract'), 'Explorer belum diperiksa.'),
    fromCheck('market_data', byCode.get('market.pairs'), 'Sumber data pasar belum diperiksa.'),
    contractSecurity,
    fundFlow,
    fromCheck('internal_traces', byCode.get('rpc.trace'), 'RPC trace belum diperiksa.'),
    multichain,
  ];
}

/** Simpan smoke test, lalu naikkan/turunkan status chain dan kemampuannya ke hasil itu. */
export async function recordSmokeTest(db: Database, report: SmokeTestReport): Promise<{ checkId: number; capabilities: CapabilityStatus[] }> {
  const capabilities = capabilitiesFromSmoke(report);
  return db.transaction(async (tx) => {
    const [check] = await tx
      .insert(chainSmokeChecks)
      .values({ chainId: report.chainId, status: report.status, checks: report.checks, testedAt: report.testedAt })
      .returning({ id: chainSmokeChecks.id });
    await tx.update(chains).set({ supportStatus: report.status, supportCheckId: check.id }).where(eq(chains.id, report.chainId));
    await tx
      .insert(chainCapabilities)
      .values(capabilities.map((item) => ({ chainId: report.chainId, ...item, checkId: check.id, updatedAt: report.testedAt })))
      .onConflictDoUpdate({
        target: [chainCapabilities.chainId, chainCapabilities.capability],
        set: {
          status: sql`excluded.status`,
          source: sql`excluded.source`,
          reason: sql`excluded.reason`,
          checkId: sql`excluded.check_id`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
    return { checkId: check.id, capabilities };
  });
}
