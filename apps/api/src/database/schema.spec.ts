import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { count, eq, sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { buildEvidenceKey, normalizeAddress, normalizeTxHash } from './identifiers.js';
import * as schema from './schema/index.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
const SEED_CHAINS_SQL = readFileSync(
  fileURLToPath(new URL('../../drizzle/0001_seed_chains.sql', import.meta.url)),
  'utf8',
);
const ROBINHOOD_EXPLORER_SQL = readFileSync(
  fileURLToPath(new URL('../../drizzle/0003_robinhood_explorer.sql', import.meta.url)),
  'utf8',
);
const MIGRATION_COUNT = (
  JSON.parse(readFileSync(fileURLToPath(new URL('../../drizzle/meta/_journal.json', import.meta.url)), 'utf8')) as {
    entries: unknown[];
  }
).entries.length;

const EXPECTED_TABLES = [
  'addresses',
  'chains',
  'contract_check_evidence',
  'contract_checks',
  'evidence',
  'holders',
  'label_evidence',
  'labels',
  'provider_runs',
  'risk_finding_evidence',
  'risk_findings',
  'token_snapshot_sources',
  'token_snapshots',
  'token_transfers',
  'tokens',
  'trading_events',
  'transactions',
];

const TX_HASH = normalizeTxHash('evm', `0x${'ab'.repeat(32)}`);
const FETCHED_AT = new Date('2026-10-03T04:30:00Z');

let client: PGlite;
let db: PgliteDatabase<typeof schema>;

/** Error Drizzle membungkus error PostgreSQL; cari nama constraint di keduanya. */
async function expectConstraintViolation(action: Promise<unknown>, constraint: string) {
  const error = await action.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, `query seharusnya ditolak oleh ${constraint}`).not.toBeNull();
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  expect(messages.join('\n')).toContain(constraint);
}

async function insertAddress(chainId: string, raw: string) {
  const [row] = await db
    .insert(schema.addresses)
    .values({ chainId, address: raw, addressNormalized: normalizeAddress('evm', raw) })
    .returning();
  return row;
}

async function insertTokenWithSnapshot(rawAddress: string, blockNumber: number) {
  const address = await insertAddress('robinhood', rawAddress);
  const [token] = await db
    .insert(schema.tokens)
    .values({ chainId: 'robinhood', addressId: address.id, standard: 'erc20' })
    .returning();
  const [snapshot] = await db
    .insert(schema.tokenSnapshots)
    .values({ tokenId: token.id, blockNumber, fetchedAt: FETCHED_AT, dataStatus: 'complete' })
    .returning();
  return { address, token, snapshot };
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}, 60_000);

afterAll(async () => {
  await client.close();
});

describe('migrasi', () => {
  it('membuat semua tabel data token', async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(result.rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
  });

  it('mengisi daftar chain sesuai prioritas adapter di PRD', async () => {
    const rows = await db.select().from(schema.chains);
    expect(rows).toHaveLength(12);
    const robinhood = rows.find((row) => row.id === 'robinhood');
    expect(robinhood).toMatchObject({
      family: 'evm',
      evmChainId: 4663,
      nativeSymbol: 'ETH',
      supportStatus: 'planned',
    });
    // Belum ada chain yang boleh disebut didukung sebelum adapter & smoke test.
    expect(rows.every((row) => row.supportStatus === 'planned')).toBe(true);
    expect(rows.filter((row) => row.family !== 'evm').map((row) => row.id).sort()).toEqual([
      'bitcoin',
      'solana',
      'ton',
      'tron',
    ]);
  });

  it('aman dijalankan ulang tanpa menggandakan data', async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const applied = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from drizzle.__drizzle_migrations`,
    );
    expect(applied.rows[0].total).toBe(MIGRATION_COUNT);
    const [{ total }] = await db.select({ total: count() }).from(schema.chains);
    expect(total).toBe(12);
  });

  it('data chain idempotent dan tidak menurunkan status yang sudah naik', async () => {
    await db
      .update(schema.chains)
      .set({ supportStatus: 'validated' })
      .where(eq(schema.chains.id, 'robinhood'));
    await client.exec(SEED_CHAINS_SQL);
    const [robinhood] = await db
      .select()
      .from(schema.chains)
      .where(eq(schema.chains.id, 'robinhood'));
    expect(robinhood.supportStatus).toBe('validated');
    const [{ total }] = await db.select({ total: count() }).from(schema.chains);
    expect(total).toBe(12);
    await db
      .update(schema.chains)
      .set({ supportStatus: 'planned' })
      .where(eq(schema.chains.id, 'robinhood'));
  });

  it('mengisi explorer resmi Robinhood Chain tanpa menimpa URL yang diatur manual', async () => {
    const explorerOf = async () =>
      (await db.select().from(schema.chains).where(eq(schema.chains.id, 'robinhood')))[0].explorerUrl;
    expect(await explorerOf()).toBe('https://robinhoodchain.blockscout.com');

    await db.update(schema.chains).set({ explorerUrl: 'https://explorer.contoh.test' }).where(eq(schema.chains.id, 'robinhood'));
    await client.exec(ROBINHOOD_EXPLORER_SQL);
    expect(await explorerOf()).toBe('https://explorer.contoh.test');

    await db.update(schema.chains).set({ explorerUrl: null }).where(eq(schema.chains.id, 'robinhood'));
    await client.exec(ROBINHOOD_EXPLORER_SQL);
    expect(await explorerOf()).toBe('https://robinhoodchain.blockscout.com');
  });
});

describe('identitas dan idempotensi', () => {
  it('mencegah address ganda tanpa mengubah identifier asli', async () => {
    const raw = '0x' + 'A1'.repeat(20);
    await insertAddress('robinhood', raw);
    await db
      .insert(schema.addresses)
      .values({
        chainId: 'robinhood',
        address: raw.toLowerCase(),
        addressNormalized: normalizeAddress('evm', raw.toLowerCase()),
      })
      .onConflictDoNothing({
        target: [schema.addresses.chainId, schema.addresses.addressNormalized],
      });
    const rows = await db
      .select()
      .from(schema.addresses)
      .where(eq(schema.addresses.addressNormalized, raw.toLowerCase()));
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe(raw);
  });

  it('menyimpan snapshot sekali per token per blok (upsert)', async () => {
    const { token } = await insertTokenWithSnapshot('0x' + 'B2'.repeat(20), 100);
    await db
      .insert(schema.tokenSnapshots)
      .values({
        tokenId: token.id,
        blockNumber: 100,
        fetchedAt: FETCHED_AT,
        dataStatus: 'partial',
        holderCount: 42,
      })
      .onConflictDoUpdate({
        target: [schema.tokenSnapshots.tokenId, schema.tokenSnapshots.blockNumber],
        set: { dataStatus: 'partial', holderCount: 42 },
      });
    const rows = await db
      .select()
      .from(schema.tokenSnapshots)
      .where(eq(schema.tokenSnapshots.tokenId, token.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dataStatus: 'partial', holderCount: 42 });
  });

  it('menyimpan bukti yang sama hanya sekali lewat evidence_key', async () => {
    const values = {
      evidenceKey: buildEvidenceKey({
        chainId: 'robinhood',
        classification: 'verified_fact',
        txHash: TX_HASH,
        logIndex: 0,
      }),
      chainId: 'robinhood',
      classification: 'verified_fact' as const,
      explanation: 'Transfer 1 ETH dari funder ke wallet A.',
      txHash: TX_HASH,
      blockNumber: 10,
      logIndex: 0,
      fetchedAt: FETCHED_AT,
    };
    await db.insert(schema.evidence).values(values).onConflictDoNothing();
    await db.insert(schema.evidence).values(values).onConflictDoNothing();
    const rows = await db
      .select()
      .from(schema.evidence)
      .where(eq(schema.evidence.evidenceKey, values.evidenceKey));
    expect(rows).toHaveLength(1);
  });

  it('peristiwa tingkat transaksi tanpa log index tetap tidak bisa tercatat dua kali', async () => {
    const { token, address } = await insertTokenWithSnapshot('0x' + 'C3'.repeat(20), 1);
    const event = {
      chainId: 'robinhood',
      txHash: TX_HASH,
      type: 'deploy' as const,
      tokenId: token.id,
      toAddressId: address.id,
      amountRaw: '1000',
      blockNumber: 1,
      blockTimestamp: FETCHED_AT,
      fetchedAt: FETCHED_AT,
    };
    await db.insert(schema.tradingEvents).values(event);
    await expectConstraintViolation(
      db.insert(schema.tradingEvents).values(event),
      'trading_events_identity_unique',
    );
  });

  it('menyimpan jumlah uint256 tanpa kehilangan presisi', async () => {
    const maxUint256 = (2n ** 256n - 1n).toString();
    const address = await insertAddress('robinhood', '0x' + 'D4'.repeat(20));
    const [token] = await db
      .insert(schema.tokens)
      .values({
        chainId: 'robinhood',
        addressId: address.id,
        standard: 'erc20',
        decimals: 18,
        totalSupplyRaw: maxUint256,
      })
      .returning();
    expect(token.totalSupplyRaw).toBe(maxUint256);
  });
});

describe('aturan PRD ditegakkan oleh database', () => {
  it('chain EVM wajib punya chain ID', async () => {
    await expectConstraintViolation(
      db.insert(schema.chains).values({
        id: 'evm-tanpa-id',
        family: 'evm',
        name: 'Uji',
        nativeSymbol: 'ETH',
      }),
      'chains_evm_chain_id_matches_family',
    );
  });

  it('provider yang gagal wajib menyimpan alasannya', async () => {
    await expectConstraintViolation(
      db.insert(schema.providerRuns).values({
        provider: 'robinhood-rpc',
        kind: 'rpc',
        operation: 'token.metadata',
        status: 'unavailable',
      }),
      'provider_runs_unavailable_has_reason',
    );
    await expectConstraintViolation(
      db.insert(schema.providerRuns).values({
        provider: 'blockscout',
        kind: 'explorer',
        operation: 'token.holders',
        status: 'partial',
      }),
      'provider_runs_partial_is_explained',
    );
    const [partial] = await db
      .insert(schema.providerRuns)
      .values({
        provider: 'blockscout',
        kind: 'explorer',
        operation: 'token.holders',
        status: 'partial',
        missingFields: ['holders.balance'],
      })
      .returning();
    expect(partial.missingFields).toEqual(['holders.balance']);
  });

  it('klasifikasi label harus sesuai sumbernya', async () => {
    const address = await insertAddress('robinhood', '0x' + 'E5'.repeat(20));
    await expectConstraintViolation(
      db.insert(schema.labels).values({
        addressId: address.id,
        labelType: 'exchange',
        source: 'external',
        sourceName: 'Arkham',
        classification: 'heuristic',
      }),
      'labels_classification_matches_source',
    );
    await expectConstraintViolation(
      db.insert(schema.labels).values({
        addressId: address.id,
        labelType: 'bot',
        source: 'heuristic',
        sourceName: 'OpenChain heuristic',
        classification: 'heuristic',
      }),
      'labels_heuristic_has_confidence',
    );
  });

  it('token tidak boleh menunjuk address dari chain lain', async () => {
    const address = await insertAddress('ethereum', '0x' + 'F6'.repeat(20));
    await expectConstraintViolation(
      db.insert(schema.tokens).values({
        chainId: 'robinhood',
        addressId: address.id,
        standard: 'erc20',
      }),
      'tokens_chain_address_fk',
    );
  });

  it('risiko yang belum dinilai tidak boleh punya skor', async () => {
    const { token } = await insertTokenWithSnapshot('0x' + '17'.repeat(20), 5);
    await expectConstraintViolation(
      db.insert(schema.tokenSnapshots).values({
        tokenId: token.id,
        blockNumber: 6,
        fetchedAt: FETCHED_AT,
        dataStatus: 'complete',
        riskScore: 40,
        riskLevel: 'unknown',
      }),
      'token_snapshots_unknown_risk_has_no_score',
    );
    await expectConstraintViolation(
      db.insert(schema.tokenSnapshots).values({
        tokenId: token.id,
        blockNumber: 7,
        fetchedAt: FETCHED_AT,
        dataStatus: 'complete',
        top10Pct: '70',
        top50Pct: '60',
      }),
      'token_snapshots_top10_within_top50',
    );
  });

  it('supply pada snapshot tidak boleh negatif', async () => {
    const { token } = await insertTokenWithSnapshot('0x' + '19'.repeat(20), 5);
    await expectConstraintViolation(
      db.insert(schema.tokenSnapshots).values({
        tokenId: token.id,
        blockNumber: 6,
        fetchedAt: FETCHED_AT,
        dataStatus: 'complete',
        totalSupplyRaw: '-1',
      }),
      'token_snapshots_total_supply_non_negative',
    );
  });

  it('porsi holder tidak boleh lebih dari 100%', async () => {
    const { snapshot, address } = await insertTokenWithSnapshot('0x' + '28'.repeat(20), 9);
    await expectConstraintViolation(
      db.insert(schema.holders).values({
        snapshotId: snapshot.id,
        addressId: address.id,
        rank: 1,
        balanceRaw: '100',
        sharePct: '120',
      }),
      'holders_share_range',
    );
  });

  it('bukti harus bisa dipertanggungjawabkan sesuai klasifikasinya', async () => {
    const base = {
      chainId: 'robinhood',
      explanation: 'Uji aturan bukti.',
      fetchedAt: FETCHED_AT,
    };
    await expectConstraintViolation(
      db.insert(schema.evidence).values({
        ...base,
        evidenceKey: 'fakta-tanpa-jangkar',
        classification: 'verified_fact',
      }),
      'evidence_fact_is_anchored',
    );
    await expectConstraintViolation(
      db.insert(schema.evidence).values({
        ...base,
        evidenceKey: 'heuristic-tanpa-nama',
        classification: 'heuristic',
        txHash: TX_HASH,
      }),
      'evidence_heuristic_is_explained',
    );
    await expectConstraintViolation(
      db.insert(schema.evidence).values({
        ...base,
        evidenceKey: 'label-tanpa-provider',
        classification: 'external_label',
      }),
      'evidence_external_label_has_provider',
    );
    const [heuristic] = await db
      .insert(schema.evidence)
      .values({
        ...base,
        evidenceKey: 'heuristic-lengkap',
        classification: 'heuristic',
        heuristicName: 'common_direct_funder',
        confidence: '0.640',
        txHash: TX_HASH,
      })
      .returning();
    expect(heuristic.confidence).toBe('0.640');
  });

  it('pemeriksaan kontrak yang belum dijalankan tidak boleh punya klasifikasi', async () => {
    const { snapshot } = await insertTokenWithSnapshot('0x' + '39'.repeat(20), 11);
    await expectConstraintViolation(
      db.insert(schema.contractChecks).values({
        snapshotId: snapshot.id,
        code: 'honeypot',
        label: 'Simulasi jual',
        status: 'unknown',
        value: 'Belum disimulasikan',
        classification: 'derived_metric',
      }),
      'contract_checks_unknown_has_no_classification',
    );
    await expectConstraintViolation(
      db.insert(schema.contractChecks).values({
        snapshotId: snapshot.id,
        code: 'tax',
        label: 'Pajak transaksi',
        status: 'fail',
        value: 'Jual 5%',
      }),
      'contract_checks_unknown_has_no_classification',
    );
  });
});
