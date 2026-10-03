import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { buildEvidenceKey, normalizeAddress } from '../../src/database/identifiers.js';
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

/** Hash transaksi EVM uji yang deterministik. */
export function testTxHash(seed: string): string {
  return `0x${Buffer.from(seed.padEnd(32, '.')).toString('hex').slice(0, 64)}`;
}

/** Isi hasil cek kontrak uji beserta buktinya pada sebuah snapshot. */
export async function seedContractChecks(db: TestDatabase, chainId: string, snapshotId: number) {
  const fetchedAt = new Date('2026-10-03T04:30:00Z');
  const [taxEvidence, deployEvidence] = await db
    .insert(schema.evidence)
    .values([
      {
        evidenceKey: buildEvidenceKey({ chainId, classification: 'verified_fact', txHash: testTxHash(`tax-${snapshotId}`), subject: 'tax' }),
        chainId,
        classification: 'verified_fact',
        explanation: 'Owner menaikkan pajak jual dari 2% menjadi 5%.',
        txHash: testTxHash(`tax-${snapshotId}`),
        blockNumber: 23400000,
        blockTimestamp: new Date('2026-09-28T10:05:00Z'),
        method: 'setSellTax(uint256)',
        fetchedAt,
      },
      {
        evidenceKey: buildEvidenceKey({ chainId, classification: 'verified_fact', txHash: testTxHash(`deploy-${snapshotId}`), subject: 'owner' }),
        chainId,
        classification: 'verified_fact',
        explanation: 'Kontrak dibuat dan owner diset ke deployer.',
        txHash: testTxHash(`deploy-${snapshotId}`),
        blockNumber: 23100000,
        blockTimestamp: new Date('2026-09-12T08:14:00Z'),
        fetchedAt,
      },
    ])
    .returning();

  const checks = await db
    .insert(schema.contractChecks)
    .values([
      { snapshotId, code: 'verified', label: 'Source code', status: 'pass', value: 'Terverifikasi di explorer', classification: 'external_label' },
      { snapshotId, code: 'ownership', label: 'Kepemilikan kontrak', status: 'warn', value: 'Owner masih aktif', description: 'Owner aktif masih bisa memanggil fungsi khusus owner.', classification: 'verified_fact' },
      { snapshotId, code: 'honeypot', label: 'Simulasi jual', status: 'unknown', value: 'Belum disimulasikan' },
      { snapshotId, code: 'tax', label: 'Pajak transaksi', status: 'fail', value: 'Beli 2% · Jual 5%, bisa diubah owner', classification: 'verified_fact' },
      { snapshotId, code: 'mint', label: 'Fungsi mint', status: 'pass', value: 'Tidak ada mint setelah deploy', classification: 'verified_fact' },
    ])
    .returning();
  const byCode = new Map(checks.map((check) => [check.code, check]));
  await db.insert(schema.contractCheckEvidence).values([
    { checkId: byCode.get('tax')!.id, evidenceId: taxEvidence.id },
    { checkId: byCode.get('ownership')!.id, evidenceId: deployEvidence.id },
  ]);
  return { checks, taxEvidence, deployEvidence };
}

/**
 * Isi holder uji pada sebuah snapshot: peringkat 1 pool likuiditas (label
 * eksternal), peringkat 2 bot (label heuristic), sisanya tanpa label.
 */
export async function seedHolders(
  db: TestDatabase,
  chainId: string,
  snapshotId: number,
  count = 12,
) {
  const rows = [];
  for (let rank = 1; rank <= count; rank++) {
    const raw = `0x${rank.toString(16).padStart(2, '0').repeat(20)}`;
    const address = await insertEvmAddress(db, chainId, raw);
    rows.push({ rank, address });
  }
  await db.insert(schema.holders).values(
    rows.map(({ rank, address }) => ({
      snapshotId,
      addressId: address.id,
      rank,
      // Saldo menurun per peringkat; supply total 1 miliar token (18 desimal).
      balanceRaw: `${(200 - rank * 10) * 1_000_000}000000000000000000`,
      sharePct: ((200 - rank * 10) / 10).toFixed(6),
    })),
  );
  const pool = rows[0].address;
  const bot = rows[1].address;
  await db.insert(schema.labels).values([
    {
      addressId: pool.id,
      labelType: 'liquidity_pool',
      name: 'Uniswap V2: NBLA/WETH',
      source: 'external',
      sourceName: 'Blockscout',
      classification: 'external_label',
    },
    {
      addressId: bot.id,
      labelType: 'bot',
      name: 'Kemungkinan bundler',
      source: 'heuristic',
      sourceName: 'OpenChain heuristic',
      classification: 'heuristic',
      confidence: '0.640',
    },
    {
      addressId: bot.id,
      labelType: 'whale',
      source: 'user',
      sourceName: 'Catatan investigator',
      classification: 'assumption',
    },
  ]);
  return rows;
}

/**
 * Isi temuan risiko uji beserta buktinya. Temuan pajak memakai bukti yang
 * sama dengan pemeriksaan kontrak `tax` (dari `seedContractChecks`).
 */
export async function seedRiskFindings(
  db: TestDatabase,
  chainId: string,
  snapshotId: number,
  taxEvidenceId: number,
) {
  const fetchedAt = new Date('2026-10-03T04:30:00Z');
  const evidenceRows = await db
    .insert(schema.evidence)
    .values([
      {
        evidenceKey: `funding-1-${snapshotId}`,
        chainId,
        classification: 'verified_fact',
        explanation: 'Funder mengirim 1,5 ETH ke wallet bundler pertama.',
        txHash: testTxHash(`fund-1-${snapshotId}`),
        blockNumber: 23100100,
        blockTimestamp: new Date('2026-09-12T08:05:00Z'),
        asset: 'ETH',
        amountRaw: '1500000000000000000',
        fetchedAt,
      },
      {
        evidenceKey: `funding-2-${snapshotId}`,
        chainId,
        classification: 'verified_fact',
        explanation: 'Funder yang sama mengirim 1,5 ETH ke wallet bundler kedua.',
        txHash: testTxHash(`fund-2-${snapshotId}`),
        blockNumber: 23100200,
        blockTimestamp: new Date('2026-09-12T08:09:00Z'),
        asset: 'ETH',
        amountRaw: '1500000000000000000',
        fetchedAt,
      },
      {
        evidenceKey: `bundle-${snapshotId}`,
        chainId,
        classification: 'heuristic',
        explanation: 'Dua wallet didanai funder yang sama dalam 4 menit lalu membeli di blok peluncuran.',
        txHash: testTxHash(`bundle-${snapshotId}`),
        blockNumber: 23100300,
        heuristicName: 'common_direct_funder',
        confidence: '0.640',
        fetchedAt,
      },
      {
        evidenceKey: `lp-claim-${snapshotId}`,
        chainId,
        classification: 'assumption',
        explanation: 'Tim mengklaim LP terkunci 12 bulan; transaksi penguncian belum ditemukan.',
        fetchedAt,
      },
    ])
    .returning();
  const [funding1, funding2, bundle, lpClaim] = evidenceRows;

  const findings = await db
    .insert(schema.riskFindings)
    .values([
      {
        snapshotId,
        code: 'liquidity_lock_claim',
        title: 'Likuiditas diklaim terkunci 12 bulan',
        description: 'Klaim tim belum didukung transaksi penguncian.',
        severity: 'medium',
        classification: 'assumption',
      },
      {
        snapshotId,
        code: 'common_funding',
        title: 'Beberapa wallet dibiayai dari sumber yang sama',
        description: 'Pola mirip bundler, belum pasti dioperasikan pihak yang sama.',
        severity: 'medium',
        classification: 'heuristic',
      },
      {
        snapshotId,
        code: 'owner_can_change_tax',
        title: 'Owner masih bisa mengubah pajak transaksi',
        description: 'Kepemilikan belum di-renounce dan pajak jual sudah dinaikkan.',
        severity: 'high',
        classification: 'verified_fact',
      },
    ])
    .returning();
  const byCode = new Map(findings.map((finding) => [finding.code, finding]));
  await db.insert(schema.riskFindingEvidence).values([
    { findingId: byCode.get('owner_can_change_tax')!.id, evidenceId: taxEvidenceId },
    { findingId: byCode.get('common_funding')!.id, evidenceId: funding1.id },
    { findingId: byCode.get('common_funding')!.id, evidenceId: funding2.id },
    { findingId: byCode.get('common_funding')!.id, evidenceId: bundle.id },
    { findingId: byCode.get('liquidity_lock_claim')!.id, evidenceId: lpClaim.id },
  ]);
  return { findings, evidence: evidenceRows };
}
