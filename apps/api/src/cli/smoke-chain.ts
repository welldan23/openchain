/**
 * Smoke test adapter chain: cek RPC, explorer, indexer, dan data pasar dengan
 * token contoh. Sesuai PRD, chain hanya boleh disebut didukung bila lolos.
 *
 *   npm run smoke:chain -- <chain|all> [--record] [--json]
 *
 * `--record` menyimpan hasilnya sebagai bukti (`chain_smoke_checks`), lalu
 * memperbarui `chains.support_status` dan status tiap kemampuan data di
 * `chain_capabilities` (butuh DATABASE_URL). Kode keluar 0 bila semua chain minimal `experimental`.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { SmokeTestReport } from '../chains/chain-adapter.types.js';
import { ChainNotSupportedError, ChainRegistry, type ChainSetup } from '../chains/chain-registry.js';
import { recordSmokeTest } from '../chains/chain-support-recorder.js';
import { loadDotEnv } from '../common/env.js';
import type { Database } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import type { ChainSupportStatus } from '../database/schema/enums.js';
import { pad, parseArgs } from './cli-format.js';

const USAGE = 'Pemakaian: npm run smoke:chain -- <chain|all> [--record] [--json]';

const STATUS_MEANING: Record<ChainSupportStatus, string> = {
  validated: 'semua provider lolos; chain boleh disebut didukung',
  experimental: 'RPC lolos, tapi sebagian sumber data belum; data token akan parsial',
  planned: 'RPC belum lolos; chain belum bisa dipakai',
};

function printReport(report: SmokeTestReport, setup: ChainSetup): void {
  console.log(`${setup.name} (${setup.chainId}, chain ID ${setup.evmChainId})`);
  console.log(`  RPC: ${setup.rpc} · Explorer: ${setup.explorer} · Pasar: ${setup.market}`);
  for (const check of report.checks) {
    const icon = check.ok ? '✓' : check.level === 'optional' ? '·' : '✗';
    const code = check.level === 'optional' ? `${check.code} (opsional)` : check.code;
    console.log(`  ${icon} ${pad(code, 26)} ${pad(check.provider, 15)} ${check.detail}`);
  }
  console.log(`  Status: ${report.status} — ${STATUS_MEANING[report.status]}\n`);
}

async function record(reports: SmokeTestReport[]): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL belum diisi; hasil smoke test tidak bisa disimpan.');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema }) as unknown as Database;
    for (const report of reports) {
      const { checkId, capabilities } = await recordSmokeTest(db, report);
      console.log(`Status dukungan disimpan: ${report.chainId} → ${report.status} (smoke test #${checkId})`);
      for (const item of capabilities) console.log(`    ${pad(item.capability, 20)} ${pad(item.status, 12)} ${item.source ?? item.reason ?? ''}`);
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const target = positional[0];
  if (!target) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const registry = new ChainRegistry(process.env);
  try {
    const chainIds = target === 'all' ? registry.chainIds() : [registry.definition(target).id];
    const reports: SmokeTestReport[] = [];
    // Berurutan supaya tidak membebani provider publik.
    for (const chainId of chainIds) {
      const report = await registry.adapter(chainId).smokeTest();
      reports.push(report);
      if (!flags.has('json')) printReport(report, registry.describe(chainId));
    }
    if (flags.has('json')) console.log(JSON.stringify(reports, null, 2));
    if (flags.has('record')) await record(reports);
    process.exitCode = reports.every((report) => report.status !== 'planned') ? 0 : 1;
  } catch (error) {
    console.error(error instanceof ChainNotSupportedError || error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

await main();
