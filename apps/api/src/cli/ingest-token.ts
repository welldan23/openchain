/**
 * Ambil data satu token dari chain lalu simpan sebagai snapshot:
 *
 *   npm run ingest -- <chain> <address> [--json]
 *
 * Hanya membaca blockchain. URL RPC, API key, dan URL database dibaca dari
 * environment dan tidak pernah dicetak. Kode keluar 0 bila snapshot tersimpan.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ChainNotSupportedError, ChainRegistry, type ChainSetup } from '../chains/chain-registry.js';
import { loadDotEnv } from '../common/env.js';
import { formatUnits } from '../common/units.js';
import type { Database } from '../database/database.module.js';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import * as schema from '../database/schema/index.js';
import { TokenIngestionService, type IngestionResult } from '../ingestion/token-ingestion.service.js';
import { SnapshotRecorder } from '../snapshots/snapshot-recorder.service.js';
import { formatDecimal, formatInteger, pad, parseArgs, STATUS_ICON } from './cli-format.js';

const USAGE = 'Pemakaian: npm run ingest -- <chain> <address> [--json]';

function printSetup(setup: ChainSetup, address: string): void {
  console.log(`Ingest ${address} di ${setup.name} (chain ID ${setup.evmChainId})`);
  console.log(`  RPC: ${setup.rpc} · Explorer: ${setup.explorer} · Pasar: ${setup.market}\n`);
}

function printResult(result: IngestionResult): void {
  if (result.snapshot && result.token) {
    const { snapshot, token } = result;
    console.log(
      `Snapshot #${snapshot.id} tersimpan pada blok ${formatInteger(snapshot.blockNumber)} (status data: ${snapshot.dataStatus})`,
    );
    const name = token.name ?? '(nama tidak tersedia)';
    const symbol = token.symbol ? ` (${token.symbol})` : '';
    const decimals = token.decimals === null ? 'desimal tidak diketahui' : `${token.decimals} desimal`;
    console.log(`  Token  : ${name}${symbol}, ${decimals}`);
    if (token.totalSupplyRaw !== null && token.decimals !== null) {
      console.log(`  Supply : ${formatDecimal(formatUnits(token.totalSupplyRaw, token.decimals))} pada blok snapshot`);
    }
    if (result.holdersStored === null) {
      console.log('  Holder : tidak tersimpan (lihat alasan di daftar provider)');
    } else {
      const total = result.holderCount === null ? '' : ` dari ${formatInteger(result.holderCount)} holder`;
      const concentration = result.concentration
        ? ` · top 10 ${formatDecimal(result.concentration.top10Pct, 2)}% · top 50 ${formatDecimal(result.concentration.top50Pct, 2)}%`
        : '';
      console.log(`  Holder : ${result.holdersStored} holder teratas tersimpan${total}${concentration}`);
    }
    const { fail, warn, unknown, pass } = result.checks;
    console.log(`  Cek    : ${fail} berisiko, ${warn} perlu perhatian, ${unknown} belum dicek, ${pass} lolos`);
  } else {
    console.log(`Snapshot tidak dibuat: ${result.failure}`);
  }

  console.log('\nProvider:');
  for (const run of result.runs) {
    const detail = [run.errorReason, run.missingFields.length ? `kurang: ${run.missingFields.join(', ')}` : null]
      .filter(Boolean)
      .join(' · ');
    console.log(
      `  ${STATUS_ICON[run.status]} ${pad(run.status, 12)} ${pad(run.provider, 15)} ${pad(run.kind, 13)} ${pad(run.operation, 15)} ${detail}`.trimEnd(),
    );
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [chainId, address] = positional;
  if (!chainId || !address) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL belum diisi. Salin .env.example menjadi .env lalu sesuaikan.');
    process.exitCode = 1;
    return;
  }

  const registry = new ChainRegistry(process.env);
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    // Cek chain dan format address dulu, sebelum ada request ke provider.
    normalizeAddress(registry.definition(chainId).family, address);
    if (!flags.has('json')) printSetup(registry.describe(chainId), address);
    const db = drizzle(pool, { schema }) as unknown as Database;
    const result = await new TokenIngestionService(db, new SnapshotRecorder(db), registry).ingest(chainId, address);
    if (flags.has('json')) console.log(JSON.stringify(result, null, 2));
    else printResult(result);
    process.exitCode = result.snapshot ? 0 : 1;
  } catch (error) {
    if (error instanceof ChainNotSupportedError || error instanceof InvalidIdentifierError) {
      console.error(error.message);
    } else {
      // Pesan error pg dan provider tidak memuat URL atau password.
      console.error('Ingest gagal:', error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
