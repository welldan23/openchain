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
  'address_flow_scans',
  'addresses',
  'bridge_transfers',
  'chain_capabilities',
  'chain_smoke_checks',
  'chains',
  'contract_check_evidence',
  'contract_checks',
  'coordination_event_members',
  'coordination_events',
  'coordination_txs',
  'evidence',
  'holders',
  'info_classification_labels',
  'infrastructure_contracts',
  'infrastructure_protocols',
  'label_evidence',
  'labels',
  'map_cluster_members',
  'map_cluster_signal_evidence',
  'map_cluster_signals',
  'map_clusters',
  'map_edges',
  'map_nodes',
  'movement_classifications',
  'multichain_chain_activity',
  'multichain_scans',
  'native_transfers',
  'provider_runs',
  'risk_finding_evidence',
  'risk_findings',
  'token_snapshot_sources',
  'token_snapshots',
  'token_transfers',
  'tokens',
  'trading_events',
  'transactions',
  'wallet_maps',
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
  it('membuat semua tabel data token dan aliran dana', async () => {
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
    const [smoke] = await db
      .insert(schema.chainSmokeChecks)
      .values({ chainId: 'robinhood', status: 'validated', checks: [], testedAt: FETCHED_AT })
      .returning();
    await db
      .update(schema.chains)
      .set({ supportStatus: 'validated', supportCheckId: smoke.id })
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
      .set({ supportStatus: 'planned', supportCheckId: null })
      .where(eq(schema.chains.id, 'robinhood'));
  });

  it('chain dan kemampuannya tidak boleh disebut didukung tanpa smoke test tersimpan', async () => {
    await expectConstraintViolation(
      db.update(schema.chains).set({ supportStatus: 'experimental' }).where(eq(schema.chains.id, 'base')),
      'chains_support_needs_check',
    );
    await expectConstraintViolation(
      db.insert(schema.chainCapabilities).values({ chainId: 'base', capability: 'holders', status: 'validated', source: 'blockscout' }),
      'chain_capabilities_needs_check',
    );
    const [smoke] = await db
      .insert(schema.chainSmokeChecks)
      .values({ chainId: 'base', status: 'validated', checks: [{ code: 'rpc.chain_id', ok: true }], testedAt: FETCHED_AT })
      .returning();
    await expectConstraintViolation(
      db.insert(schema.chainCapabilities).values({ chainId: 'base', capability: 'holders', status: 'validated', checkId: smoke.id }),
      'chain_capabilities_needs_check',
    );
    await db.insert(schema.chainCapabilities).values({ chainId: 'base', capability: 'holders', status: 'validated', source: 'blockscout', checkId: smoke.id });
    await db.insert(schema.chainCapabilities).values({ chainId: 'base', capability: 'fund_flow', status: 'planned', reason: 'Belum ada smoke test' });
    await expectConstraintViolation(
      db.insert(schema.chainSmokeChecks).values({ chainId: 'base', status: 'planned', checks: { ok: true }, testedAt: FETCHED_AT }),
      'chain_smoke_checks_checks_is_array',
    );
    await db.delete(schema.chainCapabilities).where(eq(schema.chainCapabilities.chainId, 'base'));
  });

  it('mengisi nama dan penjelasan semua jenis informasi', async () => {
    const rows = await db.select().from(schema.infoClassificationLabels).orderBy(schema.infoClassificationLabels.position);
    expect(rows.map((row) => row.classification)).toEqual(['verified_fact', 'derived_metric', 'external_label', 'heuristic', 'assumption', 'unavailable']);
    expect(rows.map((row) => row.classification).sort()).toEqual([...schema.infoClassification.enumValues].sort());
    expect(rows[0]).toMatchObject({ name: 'Fakta on-chain' });
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

describe('aliran dana: transfer native dan token', () => {
  const nativeTransfer = (fromAddressId: number, toAddressId: number, overrides: Partial<typeof schema.nativeTransfers.$inferInsert> = {}) => ({
    chainId: 'robinhood',
    txHash: normalizeTxHash('evm', `0x${'e1'.repeat(32)}`),
    kind: 'transaction' as const,
    fromAddressId,
    toAddressId,
    amountRaw: '1500000000000000000',
    blockNumber: 500,
    blockTimestamp: FETCHED_AT,
    fetchedAt: FETCHED_AT,
    ...overrides,
  });

  it('mencatat nilai transaksi dan panggilan internal dalam satu transaksi tanpa duplikat', async () => {
    const funder = await insertAddress('robinhood', '0x' + '51'.repeat(20));
    const router = await insertAddress('robinhood', '0x' + '52'.repeat(20));
    await db.insert(schema.nativeTransfers).values(nativeTransfer(funder.id, router.id));
    await db
      .insert(schema.nativeTransfers)
      .values(nativeTransfer(router.id, funder.id, { kind: 'internal', tracePath: '0.1', amountRaw: '1000' }));
    // Ingest ulang transaksi yang sama tidak menambah baris.
    await db.insert(schema.nativeTransfers).values(nativeTransfer(funder.id, router.id)).onConflictDoNothing();
    const rows = await db.select().from(schema.nativeTransfers).where(eq(schema.nativeTransfers.fromAddressId, funder.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tracePath: '', amountUsd: null });
    await expectConstraintViolation(
      db.insert(schema.nativeTransfers).values(nativeTransfer(funder.id, router.id)),
      'native_transfers_identity_unique',
    );
  });

  it('menolak transfer bernilai nol dan trace path yang tidak cocok dengan jenisnya', async () => {
    const a = await insertAddress('robinhood', '0x' + '53'.repeat(20));
    const b = await insertAddress('robinhood', '0x' + '54'.repeat(20));
    await expectConstraintViolation(
      db.insert(schema.nativeTransfers).values(nativeTransfer(a.id, b.id, { amountRaw: '0' })),
      'native_transfers_amount_positive',
    );
    await expectConstraintViolation(
      db.insert(schema.nativeTransfers).values(nativeTransfer(a.id, b.id, { tracePath: '0' })),
      'native_transfers_trace_path_matches_kind',
    );
    await expectConstraintViolation(
      db.insert(schema.nativeTransfers).values(nativeTransfer(a.id, b.id, { kind: 'internal' })),
      'native_transfers_trace_path_matches_kind',
    );
    await expectConstraintViolation(
      db.insert(schema.nativeTransfers).values(nativeTransfer(a.id, b.id, { amountUsd: '-1' })),
      'native_transfers_usd_non_negative',
    );
  });

  it('pengirim dan penerima wajib di chain yang sama dengan transfer', async () => {
    const local = await insertAddress('robinhood', '0x' + '55'.repeat(20));
    const other = await insertAddress('ethereum', '0x' + '56'.repeat(20));
    await expectConstraintViolation(
      db
        .insert(schema.nativeTransfers)
        .values(nativeTransfer(local.id, other.id, { txHash: normalizeTxHash('evm', `0x${'e3'.repeat(32)}`) })),
      'native_transfers_chain_to_fk',
    );
    const { token } = await insertTokenWithSnapshot('0x' + '57'.repeat(20), 12);
    await expectConstraintViolation(
      db.insert(schema.tokenTransfers).values({
        chainId: 'robinhood',
        txHash: TX_HASH,
        logIndex: 3,
        tokenId: token.id,
        fromAddressId: other.id,
        toAddressId: local.id,
        amountRaw: '10',
        blockNumber: 12,
        blockTimestamp: FETCHED_AT,
        fetchedAt: FETCHED_AT,
      }),
      'token_transfers_chain_from_fk',
    );
  });

  it('transfer token menyimpan nilai USD saat transaksi, atau kosong bila harga tidak diketahui', async () => {
    const { token } = await insertTokenWithSnapshot('0x' + '58'.repeat(20), 13);
    const from = await insertAddress('robinhood', '0x' + '59'.repeat(20));
    const to = await insertAddress('robinhood', '0x' + '5a'.repeat(20));
    const base = {
      chainId: 'robinhood',
      txHash: normalizeTxHash('evm', `0x${'e2'.repeat(32)}`),
      tokenId: token.id,
      fromAddressId: from.id,
      toAddressId: to.id,
      amountRaw: '25',
      blockNumber: 13,
      blockTimestamp: FETCHED_AT,
      fetchedAt: FETCHED_AT,
    };
    const [priced] = await db.insert(schema.tokenTransfers).values({ ...base, logIndex: 0, amountUsd: '1234.56' }).returning();
    const [unpriced] = await db.insert(schema.tokenTransfers).values({ ...base, logIndex: 1 }).returning();
    expect(priced.amountUsd).toBe('1234.56');
    expect(unpriced.amountUsd).toBeNull();
    await expectConstraintViolation(
      db.insert(schema.tokenTransfers).values({ ...base, logIndex: 2, amountUsd: '-5' }),
      'token_transfers_usd_non_negative',
    );
  });
});

describe('aliran dana: cakupan pemindaian address', () => {
  const scan = (addressId: number, overrides: Partial<typeof schema.addressFlowScans.$inferInsert> = {}) => ({
    chainId: 'robinhood',
    addressId,
    blockFrom: 100,
    blockTo: 900,
    windowFrom: new Date('2026-09-03T00:00:00Z'),
    windowTo: FETCHED_AT,
    nativeScanned: true,
    tokensScanned: true,
    internalScanned: true,
    status: 'complete' as const,
    scannedAt: FETCHED_AT,
    ...overrides,
  });

  it('menyimpan pemindaian lengkap dan sebagian yang dijelaskan', async () => {
    const address = await insertAddress('robinhood', '0x' + '61'.repeat(20));
    await db.insert(schema.addressFlowScans).values(scan(address.id));
    const [partial] = await db
      .insert(schema.addressFlowScans)
      .values(scan(address.id, { internalScanned: false, status: 'partial', missingFields: ['internal_transfers'] }))
      .returning();
    expect(partial.missingFields).toEqual(['internal_transfers']);
  });

  it('tidak boleh mengaku lengkap bila ada jenis transfer yang belum dipindai', async () => {
    const address = await insertAddress('robinhood', '0x' + '62'.repeat(20));
    await expectConstraintViolation(
      db.insert(schema.addressFlowScans).values(scan(address.id, { internalScanned: false })),
      'address_flow_scans_complete_covers_all',
    );
  });

  it('status sebagian atau tidak tersedia wajib menjelaskan alasannya', async () => {
    const address = await insertAddress('robinhood', '0x' + '63'.repeat(20));
    await expectConstraintViolation(
      db.insert(schema.addressFlowScans).values(scan(address.id, { status: 'partial' })),
      'address_flow_scans_partial_is_explained',
    );
    await expectConstraintViolation(
      db.insert(schema.addressFlowScans).values(
        scan(address.id, { status: 'unavailable', nativeScanned: false, tokensScanned: false, internalScanned: false }),
      ),
      'address_flow_scans_unavailable_has_reason',
    );
  });

  it('rentang blok dan waktu harus masuk akal, dan address dari chain yang sama', async () => {
    const address = await insertAddress('robinhood', '0x' + '64'.repeat(20));
    await expectConstraintViolation(
      db.insert(schema.addressFlowScans).values(scan(address.id, { blockFrom: 901 })),
      'address_flow_scans_block_range',
    );
    await expectConstraintViolation(
      db.insert(schema.addressFlowScans).values(scan(address.id, { windowFrom: new Date('2026-10-05T00:00:00Z') })),
      'address_flow_scans_window',
    );
    await expectConstraintViolation(
      db.insert(schema.addressFlowScans).values(scan(address.id, { chainId: 'base' })),
      'address_flow_scans_chain_address_fk',
    );
  });
});

describe('aliran dana: klasifikasi jenis perpindahan', () => {
  async function nativeTransfer(seed: string) {
    const from = await insertAddress('robinhood', '0x' + `${seed}a1`.repeat(10));
    const to = await insertAddress('robinhood', '0x' + `${seed}b2`.repeat(10));
    const [row] = await db
      .insert(schema.nativeTransfers)
      .values({
        chainId: 'robinhood',
        txHash: normalizeTxHash('evm', `0x${seed.repeat(32)}`),
        kind: 'transaction',
        fromAddressId: from.id,
        toAddressId: to.id,
        amountRaw: '5',
        blockNumber: 1,
        blockTimestamp: FETCHED_AT,
        fetchedAt: FETCHED_AT,
      })
      .returning();
    return row;
  }

  it('satu klasifikasi per transfer; transfer biasa adalah fakta', async () => {
    const transfer = await nativeTransfer('71');
    const value = { nativeTransferId: transfer.id, movementType: 'transfer' as const, classification: 'verified_fact' as const, basis: 'Transfer langsung.', classifiedAt: FETCHED_AT };
    await db.insert(schema.movementClassifications).values(value);
    await expectConstraintViolation(db.insert(schema.movementClassifications).values(value), 'movement_classifications_native_unique');
  });

  it('wajib menunjuk tepat satu transfer', async () => {
    await expectConstraintViolation(
      db.insert(schema.movementClassifications).values({ movementType: 'transfer', classification: 'verified_fact', basis: 'x', classifiedAt: FETCHED_AT }),
      'movement_classifications_one_transfer',
    );
  });

  it('jenis berbasis label tidak boleh disebut fakta, dan fakta hanya untuk transfer/mint/burn', async () => {
    const transfer = await nativeTransfer('72');
    await expectConstraintViolation(
      db.insert(schema.movementClassifications).values({
        nativeTransferId: transfer.id,
        movementType: 'exchange_deposit',
        classification: 'verified_fact',
        basis: 'Penerima berlabel exchange.',
        classifiedAt: FETCHED_AT,
      }),
      'movement_classifications_fact_types',
    );
    await expectConstraintViolation(
      db.insert(schema.movementClassifications).values({
        nativeTransferId: transfer.id,
        movementType: 'transfer',
        classification: 'external_label',
        basis: 'x',
        classifiedAt: FETCHED_AT,
      }),
      'movement_classifications_fact_types',
    );
  });

  it('tafsiran dugaan wajib punya tingkat keyakinan', async () => {
    const transfer = await nativeTransfer('73');
    await expectConstraintViolation(
      db.insert(schema.movementClassifications).values({
        nativeTransferId: transfer.id,
        movementType: 'exchange_deposit',
        classification: 'heuristic',
        basis: 'Dugaan exchange.',
        classifiedAt: FETCHED_AT,
      }),
      'movement_classifications_heuristic_has_confidence',
    );
  });
});

/** Peta kecil: satu holder, satu pendana, dan transfer pendanaan di antaranya. */
async function mapFixture(seed: string) {
  const { token, snapshot } = await insertTokenWithSnapshot('0x' + `${seed}0c`.repeat(10), 50);
  const [map] = await db
    .insert(schema.walletMaps)
    .values({
      chainId: 'robinhood',
      tokenId: token.id,
      snapshotId: snapshot.id,
      blockNumber: 50,
      holderLimit: 50,
      fundingDepth: 2,
      status: 'complete',
      builtAt: FETCHED_AT,
    })
    .returning();
  const holder = await insertAddress('robinhood', '0x' + `${seed}a1`.repeat(10));
  const funder = await insertAddress('robinhood', '0x' + `${seed}f2`.repeat(10));
  const [holderNode, funderNode] = await db
    .insert(schema.mapNodes)
    .values([
      { mapId: map.id, chainId: 'robinhood', addressId: holder.id, role: 'holder', sharePct: '12.500000' },
      { mapId: map.id, chainId: 'robinhood', addressId: funder.id, role: 'funder' },
    ])
    .returning();
  const [transfer] = await db
    .insert(schema.nativeTransfers)
    .values({
      chainId: 'robinhood',
      txHash: normalizeTxHash('evm', `0x${seed.repeat(32)}`),
      kind: 'transaction',
      fromAddressId: funder.id,
      toAddressId: holder.id,
      amountRaw: '2000000000000000000',
      blockNumber: 40,
      blockTimestamp: FETCHED_AT,
      fetchedAt: FETCHED_AT,
    })
    .returning();
  return { token, snapshot, map, holder, funder, holderNode, funderNode, transfer };
}

describe('peta hubungan: node, edge, dan bukti transaksi', () => {
  it('menyimpan peta dengan garis yang menunjuk transfer sebagai buktinya, dan menghapusnya bersama-sama', async () => {
    const { map, holderNode, funderNode, transfer } = await mapFixture('81');
    const [edge] = await db
      .insert(schema.mapEdges)
      .values({ mapId: map.id, fromNodeId: funderNode.id, toNodeId: holderNode.id, kind: 'funding', nativeTransferId: transfer.id })
      .returning();
    expect(edge.nativeTransferId).toBe(transfer.id);
    await expectConstraintViolation(
      db.insert(schema.mapEdges).values({ mapId: map.id, fromNodeId: funderNode.id, toNodeId: holderNode.id, kind: 'funding', nativeTransferId: transfer.id }),
      'map_edges_map_native_unique',
    );
    await db.delete(schema.walletMaps).where(eq(schema.walletMaps.id, map.id));
    expect(await db.select().from(schema.mapEdges).where(eq(schema.mapEdges.mapId, map.id))).toEqual([]);
    expect(await db.select().from(schema.mapNodes).where(eq(schema.mapNodes.mapId, map.id))).toEqual([]);
    // Transfernya sendiri (fakta) tidak ikut terhapus.
    expect(await db.select().from(schema.nativeTransfers).where(eq(schema.nativeTransfers.id, transfer.id))).toHaveLength(1);
  });

  it('garis wajib punya tepat satu bukti transfer, dan transfer token harus dari tabel token', async () => {
    const { map, holderNode, funderNode, transfer } = await mapFixture('82');
    await expectConstraintViolation(
      db.insert(schema.mapEdges).values({ mapId: map.id, fromNodeId: funderNode.id, toNodeId: holderNode.id, kind: 'funding' }),
      'map_edges_one_transfer',
    );
    await expectConstraintViolation(
      db.insert(schema.mapEdges).values({ mapId: map.id, fromNodeId: funderNode.id, toNodeId: holderNode.id, kind: 'token_transfer', nativeTransferId: transfer.id }),
      'map_edges_token_kind_has_token_transfer',
    );
    await expectConstraintViolation(
      db.insert(schema.mapEdges).values({ mapId: map.id, fromNodeId: holderNode.id, toNodeId: holderNode.id, kind: 'funding', nativeTransferId: transfer.id }),
      'map_edges_distinct_nodes',
    );
  });

  it('garis hanya boleh menghubungkan node dari peta yang sama', async () => {
    const first = await mapFixture('83');
    const second = await mapFixture('84');
    await expectConstraintViolation(
      db.insert(schema.mapEdges).values({
        mapId: first.map.id,
        fromNodeId: first.funderNode.id,
        toNodeId: second.holderNode.id,
        kind: 'funding',
        nativeTransferId: first.transfer.id,
      }),
      'map_edges_to_node_fk',
    );
  });

  it('wallet penghubung tidak punya porsi supply, dan node wajib dari chain peta', async () => {
    const { map } = await mapFixture('85');
    const connector = await insertAddress('robinhood', '0x' + '85c3'.repeat(10));
    await expectConstraintViolation(
      db.insert(schema.mapNodes).values({ mapId: map.id, chainId: 'robinhood', addressId: connector.id, role: 'connector', sharePct: '0.100000' }),
      'map_nodes_non_holder_has_no_share',
    );
    const elsewhere = await insertAddress('ethereum', '0x' + '85e4'.repeat(10));
    await expectConstraintViolation(
      db.insert(schema.mapNodes).values({ mapId: map.id, chainId: 'robinhood', addressId: elsewhere.id, role: 'connector' }),
      'map_nodes_chain_address_fk',
    );
    await expectConstraintViolation(
      db.insert(schema.mapNodes).values({ mapId: map.id, chainId: 'ethereum', addressId: elsewhere.id, role: 'connector' }),
      'map_nodes_map_fk',
    );
  });

  it('peta tidak boleh memakai snapshot token lain, dan status tidak lengkap wajib dijelaskan', async () => {
    const first = await mapFixture('86');
    const other = await insertTokenWithSnapshot('0x' + '87dd'.repeat(10), 60);
    const base = { chainId: 'robinhood', tokenId: first.token.id, blockNumber: 60, holderLimit: 50, fundingDepth: 1, builtAt: FETCHED_AT };
    await expectConstraintViolation(
      db.insert(schema.walletMaps).values({ ...base, snapshotId: other.snapshot.id, status: 'complete' }),
      'wallet_maps_token_snapshot_fk',
    );
    await expectConstraintViolation(db.insert(schema.walletMaps).values({ ...base, status: 'unavailable' }), 'wallet_maps_unavailable_has_reason');
    await expectConstraintViolation(db.insert(schema.walletMaps).values({ ...base, status: 'partial' }), 'wallet_maps_partial_is_explained');
    await expectConstraintViolation(
      db.insert(schema.walletMaps).values({ ...base, status: 'complete', fundingDepth: 9 }),
      'wallet_maps_funding_depth_range',
    );
    // Waktu pengelompokan dan nama heuristic-nya selalu diisi bersamaan.
    await expectConstraintViolation(
      db.insert(schema.walletMaps).values({ ...base, status: 'complete', clusteredAt: FETCHED_AT }),
      'wallet_maps_clustering_complete',
    );
    await expectConstraintViolation(
      db.insert(schema.walletMaps).values({ ...base, status: 'complete', coordinationHeuristic: 'openchain-coordination-v1' }),
      'wallet_maps_coordination_complete',
    );
  });
});

describe('peta hubungan: kelompok wallet dan koordinasi', () => {
  const clusterBase = {
    key: 'pendana-bersama',
    name: 'Kelompok A',
    reason: 'Didanai wallet yang sama dalam 10 menit',
    labels: ['common_funding' as const],
    confidence: 'medium' as const,
    heuristicName: 'common-funding-v1',
  };

  it('menyimpan kelompok dengan anggota, sinyal, dan bukti transfernya, lalu ikut terhapus bersama peta', async () => {
    const { map, holderNode, funderNode, transfer } = await mapFixture('91');
    const [cluster] = await db
      .insert(schema.mapClusters)
      .values({ ...clusterBase, mapId: map.id, caveats: ['Pendana bisa saja exchange'] })
      .returning();
    expect(cluster.classification).toBe('heuristic');
    await db.insert(schema.mapClusterMembers).values([
      { mapId: map.id, clusterId: cluster.id, nodeId: holderNode.id },
      { mapId: map.id, clusterId: cluster.id, nodeId: funderNode.id },
    ]);
    const [signal] = await db
      .insert(schema.mapClusterSignals)
      .values({ clusterId: cluster.id, key: 'pendana-sama', label: 'Pendana langsung yang sama', detail: '2 wallet', matched: true })
      .returning();
    await db.insert(schema.mapClusterSignalEvidence).values({ signalId: signal.id, nativeTransferId: transfer.id });
    const [event] = await db
      .insert(schema.coordinationEvents)
      .values({
        mapId: map.id,
        key: 'dana-serempak',
        kind: 'funding_burst',
        detail: '2 wallet didanai dalam 1 blok',
        confidence: 'low',
        heuristicName: 'funding-burst-v1',
        startedAt: FETCHED_AT,
        windowSeconds: 0,
        blockNumber: 40,
      })
      .returning();
    await db.insert(schema.coordinationEventMembers).values({ mapId: map.id, eventId: event.id, nodeId: holderNode.id });
    await db.insert(schema.coordinationTxs).values({ eventId: event.id, action: 'funding', nativeTransferId: transfer.id });

    await db.delete(schema.walletMaps).where(eq(schema.walletMaps.id, map.id));
    expect(await db.select().from(schema.mapClusters).where(eq(schema.mapClusters.mapId, map.id))).toEqual([]);
    expect(await db.select().from(schema.mapClusterMembers).where(eq(schema.mapClusterMembers.mapId, map.id))).toEqual([]);
    expect(await db.select().from(schema.mapClusterSignals).where(eq(schema.mapClusterSignals.id, signal.id))).toEqual([]);
    expect(await db.select().from(schema.coordinationEvents).where(eq(schema.coordinationEvents.mapId, map.id))).toEqual([]);
    expect(await db.select().from(schema.coordinationTxs).where(eq(schema.coordinationTxs.eventId, event.id))).toEqual([]);
    // Transfer yang jadi bukti tetap ada: ia fakta, bukan bagian dari dugaan.
    expect(await db.select().from(schema.nativeTransfers).where(eq(schema.nativeTransfers.id, transfer.id))).toHaveLength(1);
  });

  it('kelompok selalu dugaan, wajib punya label, dan label orang dalam butuh bukti langsung', async () => {
    const { map } = await mapFixture('92');
    await expectConstraintViolation(
      db.insert(schema.mapClusters).values({ ...clusterBase, mapId: map.id, classification: 'verified_fact' }),
      'map_clusters_is_heuristic',
    );
    await expectConstraintViolation(
      db.insert(schema.mapClusters).values({ ...clusterBase, mapId: map.id, labels: [] }),
      'map_clusters_has_labels',
    );
    await expectConstraintViolation(
      db.insert(schema.mapClusters).values({ ...clusterBase, mapId: map.id, labels: ['common_funding', 'insider_or_team'] }),
      'map_clusters_insider_needs_direct_evidence',
    );
    const [insider] = await db
      .insert(schema.mapClusters)
      .values({ ...clusterBase, mapId: map.id, labels: ['insider_or_team'], hasDirectEvidence: true })
      .returning();
    expect(insider.labels).toEqual(['insider_or_team']);
  });

  it('satu wallet hanya masuk satu kelompok per peta, dan anggota wajib dari peta yang sama', async () => {
    const first = await mapFixture('93');
    const second = await mapFixture('94');
    const [a, b] = await db
      .insert(schema.mapClusters)
      .values([
        { ...clusterBase, mapId: first.map.id, key: 'a' },
        { ...clusterBase, mapId: first.map.id, key: 'b' },
      ])
      .returning();
    await db.insert(schema.mapClusterMembers).values({ mapId: first.map.id, clusterId: a.id, nodeId: first.holderNode.id });
    await expectConstraintViolation(
      db.insert(schema.mapClusterMembers).values({ mapId: first.map.id, clusterId: b.id, nodeId: first.holderNode.id }),
      'map_cluster_members_one_cluster_per_node',
    );
    await expectConstraintViolation(
      db.insert(schema.mapClusterMembers).values({ mapId: first.map.id, clusterId: a.id, nodeId: second.holderNode.id }),
      'map_cluster_members_node_fk',
    );
    await expectConstraintViolation(
      db.insert(schema.mapClusterMembers).values({ mapId: second.map.id, clusterId: a.id, nodeId: second.holderNode.id }),
      'map_cluster_members_cluster_fk',
    );
  });

  it('bukti sinyal dan transaksi koordinasi wajib menunjuk tepat satu transfer', async () => {
    const { map, transfer } = await mapFixture('95');
    const [cluster] = await db.insert(schema.mapClusters).values({ ...clusterBase, mapId: map.id }).returning();
    const [signal] = await db
      .insert(schema.mapClusterSignals)
      .values({ clusterId: cluster.id, key: 'pendana-sama', label: 'Pendana sama', detail: 'tidak cocok', matched: false })
      .returning();
    await expectConstraintViolation(
      db.insert(schema.mapClusterSignalEvidence).values({ signalId: signal.id }),
      'map_cluster_signal_evidence_one_transfer',
    );
    await db.insert(schema.mapClusterSignalEvidence).values({ signalId: signal.id, nativeTransferId: transfer.id });
    await expectConstraintViolation(
      db.insert(schema.mapClusterSignalEvidence).values({ signalId: signal.id, nativeTransferId: transfer.id }),
      'map_cluster_signal_evidence_native_unique',
    );
    const [event] = await db
      .insert(schema.coordinationEvents)
      .values({ mapId: map.id, key: 'k', kind: 'same_block_buy', detail: 'beli di blok sama', confidence: 'low', heuristicName: 'h', startedAt: FETCHED_AT, windowSeconds: 0 })
      .returning();
    await expectConstraintViolation(
      db.insert(schema.coordinationTxs).values({ eventId: event.id, action: 'buy' }),
      'coordination_txs_one_transfer',
    );
  });

  it('kejadian koordinasi selalu dugaan, rentang waktunya tidak negatif, dan anggotanya dari peta yang sama', async () => {
    const first = await mapFixture('96');
    const second = await mapFixture('97');
    const base = { mapId: first.map.id, key: 'k', kind: 'similar_amount' as const, detail: 'jumlah mirip', confidence: 'low' as const, heuristicName: 'h', startedAt: FETCHED_AT };
    await expectConstraintViolation(
      db.insert(schema.coordinationEvents).values({ ...base, windowSeconds: 0, classification: 'verified_fact' }),
      'coordination_events_is_heuristic',
    );
    await expectConstraintViolation(
      db.insert(schema.coordinationEvents).values({ ...base, windowSeconds: -1 }),
      'coordination_events_window_non_negative',
    );
    const [event] = await db.insert(schema.coordinationEvents).values({ ...base, windowSeconds: 120 }).returning();
    await expectConstraintViolation(
      db.insert(schema.coordinationEventMembers).values({ mapId: first.map.id, eventId: event.id, nodeId: second.holderNode.id }),
      'coordination_event_members_node_fk',
    );
  });
});

describe('aktivitas lintas chain', () => {
  async function scanFixture() {
    const [scan] = await db
      .insert(schema.multichainScans)
      .values({
        family: 'evm',
        address: '0x' + 'Ab'.repeat(20),
        addressNormalized: '0x' + 'ab'.repeat(20),
        windowFrom: FETCHED_AT,
        windowTo: FETCHED_AT,
        status: 'partial',
        statusReason: 'BNB Chain belum punya indexer',
        scannedAt: FETCHED_AT,
      })
      .returning();
    return scan;
  }

  it('ringkasan per chain: satu baris per chain, kosong bila tidak terbaca, dan ikut terhapus bersama pemindaian', async () => {
    const scan = await scanFixture();
    const onBase = await insertAddress('base', '0x' + 'a9'.repeat(20));
    await db.insert(schema.multichainChainActivity).values([
      { scanId: scan.id, chainId: 'base', addressId: onBase.id, status: 'complete', txCount: 4, inUsd: '120.50', outUsd: '0', counterpartyCount: 3 },
      { scanId: scan.id, chainId: 'bsc', status: 'unavailable', statusReason: 'Belum ada indexer' },
    ]);
    await expectConstraintViolation(
      db.insert(schema.multichainChainActivity).values({ scanId: scan.id, chainId: 'base', status: 'complete' }),
      'multichain_chain_activity_scan_chain_unique',
    );
    await expectConstraintViolation(
      db.insert(schema.multichainChainActivity).values({ scanId: scan.id, chainId: 'ethereum', status: 'unavailable' }),
      'multichain_chain_activity_unavailable_has_reason',
    );
    await expectConstraintViolation(
      db.insert(schema.multichainChainActivity).values({ scanId: scan.id, chainId: 'ethereum', status: 'unavailable', statusReason: 'RPC gagal', txCount: 0 }),
      'multichain_chain_activity_unavailable_has_no_numbers',
    );
    await expectConstraintViolation(
      db.insert(schema.multichainChainActivity).values({ scanId: scan.id, chainId: 'ethereum', addressId: onBase.id, status: 'complete' }),
      'multichain_chain_activity_chain_address_fk',
    );
    await expectConstraintViolation(
      db.insert(schema.multichainScans).values({
        family: 'evm',
        address: 'x',
        addressNormalized: 'x',
        windowFrom: FETCHED_AT,
        windowTo: FETCHED_AT,
        status: 'unavailable',
        scannedAt: FETCHED_AT,
      }),
      'multichain_scans_unavailable_has_reason',
    );
    await db.delete(schema.multichainScans).where(eq(schema.multichainScans.id, scan.id));
    expect(await db.select().from(schema.multichainChainActivity).where(eq(schema.multichainChainActivity.scanId, scan.id))).toEqual([]);
  });

  it('transfer bridge: kaki kirim fakta di chain asal, pencocokan kaki terima selalu dugaan beralasan', async () => {
    const sender = await insertAddress('ethereum', '0x' + 'b8'.repeat(20));
    const bridge = await insertAddress('ethereum', '0x' + 'b9'.repeat(20));
    const recipient = await insertAddress('base', '0x' + 'b8'.repeat(20));
    const relayer = await insertAddress('base', '0x' + 'ba'.repeat(20));
    const native = async (chainId: string, from: number, to: number, seed: string) =>
      (
        await db
          .insert(schema.nativeTransfers)
          .values({
            chainId,
            txHash: normalizeTxHash('evm', `0x${seed.repeat(32)}`),
            kind: 'transaction',
            fromAddressId: from,
            toAddressId: to,
            amountRaw: '1000',
            blockNumber: 10,
            blockTimestamp: FETCHED_AT,
            fetchedAt: FETCHED_AT,
          })
          .returning()
      )[0];
    const sent = await native('ethereum', sender.id, bridge.id, 'c1');
    const received = await native('base', relayer.id, recipient.id, 'c2');
    const pending = {
      sourceChainId: 'ethereum',
      destChainId: 'base',
      bridgeAddressId: bridge.id,
      senderAddressId: sender.id,
      sentNativeTransferId: sent.id,
      amountSentRaw: '1000',
      status: 'pending' as const,
      sentAt: FETCHED_AT,
      updatedAt: FETCHED_AT,
    };
    const matched = {
      ...pending,
      status: 'matched' as const,
      recipientAddressId: recipient.id,
      receivedNativeTransferId: received.id,
      amountReceivedRaw: '998',
      receivedAt: new Date(FETCHED_AT.getTime() + 60_000),
      matchHeuristic: 'bridge-amount-time-v1',
      matchConfidence: 'medium' as const,
      matchReason: 'Jumlah selisih 0,2% dan diterima 1 menit kemudian',
    };

    await expectConstraintViolation(db.insert(schema.bridgeTransfers).values({ ...pending, status: 'matched' }), 'bridge_transfers_matched_has_evidence');
    await expectConstraintViolation(
      db.insert(schema.bridgeTransfers).values({ ...pending, receivedNativeTransferId: received.id }),
      'bridge_transfers_matched_has_evidence',
    );
    await expectConstraintViolation(
      db.insert(schema.bridgeTransfers).values({ ...matched, matchConfidence: null }),
      'bridge_transfers_matched_is_explained',
    );
    await expectConstraintViolation(
      db.insert(schema.bridgeTransfers).values({ ...matched, matchClassification: 'verified_fact' }),
      'bridge_transfers_match_is_heuristic',
    );
    await expectConstraintViolation(db.insert(schema.bridgeTransfers).values({ ...pending, destChainId: 'ethereum' }), 'bridge_transfers_distinct_chains');
    // Kaki kirim wajib transfer di chain asal, kaki terima di chain tujuan.
    await expectConstraintViolation(
      db.insert(schema.bridgeTransfers).values({ ...pending, sentNativeTransferId: received.id }),
      'bridge_transfers_sent_native_fk',
    );
    await expectConstraintViolation(
      db.insert(schema.bridgeTransfers).values({ ...matched, receivedNativeTransferId: sent.id }),
      'bridge_transfers_received_native_fk',
    );
    await expectConstraintViolation(
      db.insert(schema.bridgeTransfers).values({ ...matched, receivedAt: new Date(FETCHED_AT.getTime() - 1) }),
      'bridge_transfers_received_after_sent',
    );
    const [row] = await db.insert(schema.bridgeTransfers).values(matched).returning();
    expect(row).toMatchObject({ status: 'matched', matchClassification: 'heuristic', matchConfidence: 'medium' });
    await expectConstraintViolation(db.insert(schema.bridgeTransfers).values(pending), 'bridge_transfers_sent_native_unique');
  });
});

describe('jembatan dan router', () => {
  it('kontrak protokol menyimpan sumber pengenalannya dengan aturan yang sama seperti label', async () => {
    await expectConstraintViolation(
      db.insert(schema.infrastructureProtocols).values({ id: 'Across Bridge', name: 'Across', kind: 'bridge' }),
      'infrastructure_protocols_id_is_slug',
    );
    await db.insert(schema.infrastructureProtocols).values({ id: 'contoh-bridge', name: 'Contoh Bridge', kind: 'bridge' });
    const entry = await insertAddress('ethereum', '0x' + 'e7'.repeat(20));
    const other = await insertAddress('ethereum', '0x' + 'e8'.repeat(20));
    const onBase = await insertAddress('base', '0x' + 'e9'.repeat(20));
    const [label] = await db
      .insert(schema.labels)
      .values({ addressId: entry.id, labelType: 'bridge', name: 'Contoh Bridge: Spoke', source: 'external', sourceName: 'Blockscout', classification: 'external_label' })
      .returning();
    const base = {
      protocolId: 'contoh-bridge',
      chainId: 'ethereum',
      addressId: entry.id,
      role: 'bridge_entry' as const,
      source: 'external' as const,
      sourceName: 'Blockscout',
      classification: 'external_label' as const,
      labelId: label.id,
    };
    await expectConstraintViolation(
      db.insert(schema.infrastructureContracts).values({ ...base, classification: 'verified_fact' }),
      'infrastructure_contracts_classification_matches_source',
    );
    await expectConstraintViolation(
      db.insert(schema.infrastructureContracts).values({ ...base, source: 'heuristic', classification: 'heuristic', sourceName: 'OpenChain heuristic' }),
      'infrastructure_contracts_heuristic_has_confidence',
    );
    await expectConstraintViolation(
      db.insert(schema.infrastructureContracts).values({ ...base, addressId: other.id }),
      'infrastructure_contracts_label_address_fk',
    );
    await expectConstraintViolation(
      db.insert(schema.infrastructureContracts).values({ ...base, addressId: onBase.id, labelId: null }),
      'infrastructure_contracts_chain_address_fk',
    );
    await db.insert(schema.infrastructureContracts).values(base);
    await expectConstraintViolation(db.insert(schema.infrastructureContracts).values(base), 'infrastructure_contracts_protocol_address_source_unique');
    // Sumber lain boleh mengenali kontrak yang sama, masing-masing dengan klasifikasinya.
    await db
      .insert(schema.infrastructureContracts)
      .values({ ...base, source: 'heuristic', classification: 'heuristic', sourceName: 'OpenChain heuristic', confidence: '0.700', labelId: null });
  });
});
