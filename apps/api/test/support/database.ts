import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { normalizeAddress } from '../../src/database/identifiers.js';
import * as schema from '../../src/database/schema/index.js';

export type TestDatabase = PgliteDatabase<typeof schema>;

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Database PostgreSQL (PGlite) dalam memori yang sudah dimigrasi. */
export async function createTestDatabase(): Promise<{ client: PGlite; db: TestDatabase }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { client, db };
}

export async function insertEvmAddress(db: TestDatabase, chainId: string, raw: string) {
  const [row] = await db
    .insert(schema.addresses)
    .values({ chainId, address: raw, addressNormalized: normalizeAddress('evm', raw) })
    .returning();
  return row;
}

export interface SeedTokenOptions {
  chainId?: string;
  address: string;
  deployer?: string;
  symbol?: string;
  /** Tanpa snapshot bila `false`. */
  withSnapshot?: boolean;
  fetchedAt?: Date;
}

/** Isi satu token EVM uji beserta snapshot dan provider-nya. */
export async function seedToken(db: TestDatabase, options: SeedTokenOptions) {
  const chainId = options.chainId ?? 'robinhood';
  const address = await insertEvmAddress(db, chainId, options.address);
  const deployer = options.deployer ? await insertEvmAddress(db, chainId, options.deployer) : null;
  const [token] = await db
    .insert(schema.tokens)
    .values({
      chainId,
      addressId: address.id,
      standard: 'erc20',
      name: 'Nebula Finance',
      symbol: options.symbol ?? 'NBLA',
      decimals: 18,
      totalSupplyRaw: '1000000000000000000000000000',
      deployerAddressId: deployer?.id ?? null,
      deployTxHash: `0x${'cd'.repeat(32)}`,
      deployedAt: new Date('2026-09-12T08:14:00Z'),
      sourceVerified: true,
    })
    .returning();

  if (options.withSnapshot === false) return { token, address, snapshots: [] };

  const fetchedAt = options.fetchedAt ?? new Date('2026-10-03T04:30:00Z');
  const [olderSnapshot, latestSnapshot] = await db
    .insert(schema.tokenSnapshots)
    .values([
      {
        tokenId: token.id,
        blockNumber: 23512000,
        fetchedAt: new Date(fetchedAt.getTime() - 3_600_000),
        dataStatus: 'complete',
        holderCount: 3400,
        riskScore: 60,
        riskLevel: 'high',
      },
      {
        tokenId: token.id,
        blockNumber: 23512880,
        fetchedAt,
        dataStatus: 'partial',
        priceUsd: '0.004213',
        priceChange24hPct: '12.4',
        marketCapUsd: '4213000',
        fdvUsd: '4213000',
        liquidityUsd: '612400',
        volume24hUsd: '1843000',
        holderCount: 3482,
        txCount24h: 2915,
        top10Pct: '61.8',
        top50Pct: '78.3',
        riskScore: 68,
        riskLevel: 'high',
      },
    ])
    .returning();

  const runs = await db
    .insert(schema.providerRuns)
    .values([
      {
        provider: 'robinhood-rpc',
        kind: 'rpc',
        chainId,
        operation: 'token.metadata',
        status: 'complete',
        fetchedAt,
      },
      {
        provider: 'blockscout',
        kind: 'explorer',
        chainId,
        operation: 'token.holders',
        status: 'partial',
        missingFields: ['holders.labels'],
        fetchedAt,
      },
    ])
    .returning();
  await db
    .insert(schema.tokenSnapshotSources)
    .values(runs.map((run) => ({ snapshotId: latestSnapshot.id, providerRunId: run.id })));

  return { token, address, snapshots: [olderSnapshot, latestSnapshot] };
}
