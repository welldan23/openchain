/**
 * Bentuk Peta Hubungan Wallet satu token dari data tersimpan:
 *
 *   npm run maps:build -- <chain> <token> [--holder=N] [--kedalaman=N] [--blok=N]
 *                         [--kumpulkan] [--halaman=N] [--json]
 *
 * Butuh snapshot holder (`npm run ingest`) lebih dulu. `--kumpulkan` membaca
 * riwayat transfer holder yang belum lengkap dari indexer sebelum peta
 * dibentuk (hanya membaca blockchain); hub dan kontrak dilewati. URL RPC, API
 * key, dan URL database tidak pernah dicetak. Kode keluar 0 bila peta tersimpan.
 */
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ChainNotSupportedError, ChainRegistry } from '../chains/chain-registry.js';
import { systemClock } from '../common/clock.js';
import { loadDotEnv } from '../common/env.js';
import type { Database } from '../database/database.module.js';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import * as schema from '../database/schema/index.js';
import { FundFlowCollector } from '../flows/fund-flow-collector.js';
import { FundFlowIngestionService } from '../flows/fund-flow-ingestion.service.js';
import { MapsRepository } from '../maps/maps.repository.js';
import { MapBuildError, WalletMapBuilder, WALLET_MAP_DEFAULTS, type WalletMapBuildResult } from '../maps/wallet-map-builder.service.js';
import { formatInteger, parseArgs, STATUS_ICON } from './cli-format.js';

const USAGE =
  'Pemakaian: npm run maps:build -- <chain> <token> [--holder=N] [--kedalaman=N] [--blok=N] [--kumpulkan] [--halaman=N] [--json]';

function numberFlag(flags: Set<string>, name: string): number | undefined {
  const flag = [...flags].find((value) => value.startsWith(`${name}=`));
  if (!flag) return undefined;
  const parsed = Number(flag.slice(name.length + 1));
  if (!Number.isInteger(parsed) || parsed < 0) throw new MapBuildError('invalid_option', `--${name} harus bilangan bulat.`);
  return parsed;
}

/** Kumpulkan riwayat holder yang belum lengkap; hub dan kontrak tidak perlu. */
async function collectHolders(
  db: Database,
  registry: ChainRegistry,
  repository: MapsRepository,
  request: { chainId: string; tokenAddress: string; holderLimit: number; snapshotBlock?: number; pages?: number },
): Promise<void> {
  const chain = await repository.findChain(request.chainId);
  if (!chain) throw new MapBuildError('chain_not_found', `Chain ${request.chainId} tidak dikenal.`);
  const token = await repository.findToken(chain.id, normalizeAddress(chain.family, request.tokenAddress));
  if (!token) throw new MapBuildError('token_not_found', `Token belum pernah diambil datanya; jalankan npm run ingest dulu.`);
  const snapshot = await repository.findSnapshot(token.id, request.snapshotBlock);
  if (!snapshot) throw new MapBuildError('snapshot_not_found', 'Belum ada snapshot holder untuk token ini.');
  const holders = await repository.findHolders(snapshot.id, request.holderLimit);
  const loader = repository.loader(chain.id, token.id, snapshot.blockNumber);
  const ids = holders.map((holder) => holder.addressId);
  const [profiles, coverage] = await Promise.all([loader.profiles(ids), loader.coverage(ids)]);
  const targets = ids.filter((id) => {
    const profile = profiles.get(id);
    return coverage.get(id) !== 'full' && !profile?.hub && !profile?.burn && profile?.isContract !== true;
  });
  console.log(`Kumpulkan riwayat ${targets.length} dari ${ids.length} holder yang belum lengkap…`);
  if (targets.length === 0) return;

  const addressRows = await db.select({ address: schema.addresses.address }).from(schema.addresses).where(inArray(schema.addresses.id, targets));
  const collector = new FundFlowCollector((chainId) => registry.flowSources(chainId), systemClock, { maxPages: request.pages });
  const ingestion = new FundFlowIngestionService(db);
  const family = registry.definition(chain.id).family;
  for (const [index, row] of addressRows.entries()) {
    const collection = await collector.collect(chain.id, row.address);
    const stored = await ingestion.persist(collection, family);
    const status = collection.scan?.status ?? 'unavailable';
    console.log(
      `  ${STATUS_ICON[status]} ${index + 1}/${addressRows.length} ${row.address}: ${stored.native.found} native, ${stored.tokens.found} token` +
        (collection.failure ? ` · ${collection.failure}` : ''),
    );
  }
}

function printResult(result: WalletMapBuildResult): void {
  const { graph } = result;
  const roles = { holder: 0, funder: 0, connector: 0 };
  for (const node of graph.nodes) roles[node.role]++;
  const funding = graph.edges.filter((edge) => edge.kind === 'funding').length;
  console.log(`\n${STATUS_ICON[graph.status]} Peta #${result.mapId}: ${graph.status} (snapshot blok ${formatInteger(result.blockNumber)})`);
  console.log(`  Wallet  : ${roles.holder} holder, ${roles.funder} pendana, ${roles.connector} penghubung`);
  console.log(`  Garis   : ${funding} pendanaan, ${graph.edges.length - funding} transfer token`);
  const { holders } = graph.coverage;
  console.log(
    `  Riwayat : ${holders.full} holder lengkap, ${holders.partial} sebagian, ${holders.none} belum dipindai` +
      ` · ${graph.coverage.notTraversed} hub/kontrak tidak ditelusuri`,
  );
  if (graph.statusReason) console.log(`  Catatan : ${graph.statusReason}`);
}

async function main(): Promise<void> {
  loadDotEnv();
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [chainId, tokenAddress] = positional;
  if (!chainId || !tokenAddress) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL belum diisi. Salin .env.example menjadi .env.');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema }) as unknown as Database;
    const repository = new MapsRepository(db);
    const holderLimit = numberFlag(flags, 'holder') ?? WALLET_MAP_DEFAULTS.holderLimit;
    const fundingDepth = numberFlag(flags, 'kedalaman') ?? WALLET_MAP_DEFAULTS.fundingDepth;
    const snapshotBlock = numberFlag(flags, 'blok');
    if (flags.has('kumpulkan')) {
      const registry = new ChainRegistry(process.env);
      registry.definition(chainId);
      await collectHolders(db, registry, repository, { chainId, tokenAddress, holderLimit, snapshotBlock, pages: numberFlag(flags, 'halaman') });
    }
    const result = await new WalletMapBuilder(db, repository, systemClock).build({ chainId, tokenAddress, holderLimit, fundingDepth, snapshotBlock });
    if (flags.has('json')) console.log(JSON.stringify(result, null, 2));
    else printResult(result);
    process.exitCode = 0;
  } catch (error) {
    if (error instanceof MapBuildError || error instanceof ChainNotSupportedError || error instanceof InvalidIdentifierError) {
      console.error(error.message);
    }
    // Pesan error pg dan provider tidak memuat URL atau password.
    else console.error('Pembentukan peta gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
