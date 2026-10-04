/**
 * Kumpulkan aliran dana satu address di satu atau beberapa chain:
 *
 *   npm run flows:collect -- <address> [chain ...] [--halaman=N] [--tanpa-simpan] [--json]
 *
 * Tanpa daftar chain, semua chain EVM yang punya adapter dipindai. Hanya
 * membaca blockchain. `--tanpa-simpan` hanya menampilkan hasil tanpa
 * database. URL RPC, API key, dan URL database tidak pernah dicetak.
 * Kode keluar 0 bila setidaknya satu chain berhasil dipindai.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ChainNotSupportedError, ChainRegistry } from '../chains/chain-registry.js';
import { systemClock } from '../common/clock.js';
import { loadDotEnv } from '../common/env.js';
import type { Database } from '../database/database.module.js';
import { InvalidIdentifierError } from '../database/identifiers.js';
import * as schema from '../database/schema/index.js';
import { FundFlowCollector } from '../flows/fund-flow-collector.js';
import { FundFlowIngestionService, type FlowIngestionResult } from '../flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection } from '../flows/fund-flow.types.js';
import { formatInteger, pad, parseArgs, STATUS_ICON } from './cli-format.js';

const USAGE = 'Pemakaian: npm run flows:collect -- <address> [chain ...] [--halaman=N] [--tanpa-simpan] [--json]';

function pagesFrom(flags: Set<string>): number | undefined {
  const flag = [...flags].find((value) => value.startsWith('halaman='));
  const parsed = flag ? Number(flag.slice('halaman='.length)) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function printCollection(collection: AddressFlowCollection, stored: FlowIngestionResult | null): void {
  const scan = collection.scan;
  const status = scan?.status ?? 'unavailable';
  console.log(`\n${STATUS_ICON[status]} ${collection.chainId}: ${status}`);
  if (scan) {
    console.log(
      `  Cakupan  : blok ${formatInteger(scan.blockFrom)}–${formatInteger(scan.blockTo)} · ${scan.windowFrom.toISOString()} s/d ${scan.windowTo.toISOString()}`,
    );
  }
  const internal = collection.nativeTransfers.filter((transfer) => transfer.kind === 'internal').length;
  console.log(
    `  Transfer : ${collection.nativeTransfers.length - internal} native, ${internal} internal, ${collection.tokenTransfers.length} token`,
  );
  const skipped = collection.coverage.native.skipped;
  if (skipped && skipped.pending + skipped.failed + skipped.zeroValue > 0) {
    console.log(`  Dilewati : ${skipped.pending} pending, ${skipped.failed} gagal, ${skipped.zeroValue} tanpa nilai (transaksi)`);
  }
  if (stored) {
    console.log(
      `  Disimpan : ${stored.native.inserted} native & ${stored.tokens.inserted} token baru${stored.scanId ? ` · pemindaian #${stored.scanId}` : ''}`,
    );
  }
  const reason = scan?.statusReason ?? collection.failure;
  if (reason) console.log(`  Catatan  : ${reason}`);
  for (const run of collection.runs) {
    console.log(`    ${STATUS_ICON[run.status]} ${pad(run.provider, 16)} ${pad(run.operation, 28)} ${run.errorReason ?? ''}`.trimEnd());
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [address, ...requested] = positional;
  if (!address) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const dryRun = flags.has('tanpa-simpan');
  const databaseUrl = process.env.DATABASE_URL;
  if (!dryRun && !databaseUrl) {
    console.error('DATABASE_URL belum diisi. Salin .env.example menjadi .env, atau pakai --tanpa-simpan.');
    process.exitCode = 1;
    return;
  }

  const registry = new ChainRegistry(process.env);
  const pool = dryRun ? null : new Pool({ connectionString: databaseUrl });
  try {
    const chainIds = requested.length > 0 ? requested : registry.chainIds();
    for (const chainId of chainIds) registry.definition(chainId);
    const collector = new FundFlowCollector((chainId) => registry.flowSources(chainId), systemClock, { maxPages: pagesFrom(flags) });
    if (!flags.has('json')) console.log(`Kumpulkan aliran dana ${address} di ${chainIds.join(', ')}`);
    const collections = await collector.collectAcross(chainIds, address);
    const service = pool ? new FundFlowIngestionService(drizzle(pool, { schema }) as unknown as Database) : null;
    const results: Array<{ collection: AddressFlowCollection; stored: FlowIngestionResult | null }> = [];
    for (const collection of collections) {
      const stored = service ? await service.persist(collection, registry.definition(collection.chainId).family) : null;
      results.push({ collection, stored });
    }
    if (flags.has('json')) console.log(JSON.stringify(results, null, 2));
    else for (const { collection, stored } of results) printCollection(collection, stored);
    process.exitCode = collections.some((collection) => collection.failure === null) ? 0 : 1;
  } catch (error) {
    if (error instanceof ChainNotSupportedError || error instanceof InvalidIdentifierError) console.error(error.message);
    // Pesan error pg dan provider tidak memuat URL atau password.
    else console.error('Pengumpulan gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

await main();
