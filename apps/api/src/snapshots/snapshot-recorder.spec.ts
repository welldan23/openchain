import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { count, eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Database } from '../database/database.module.js';
import { normalizeAddress, normalizeTxHash } from '../database/identifiers.js';
import * as schema from '../database/schema/index.js';
import { SnapshotRecorder, SnapshotRecordError } from './snapshot-recorder.service.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

const FETCHED_AT = new Date('2026-10-03T04:30:00Z');
const hash = (n: number) => normalizeTxHash('evm', `0x${n.toString(16).padStart(64, '0')}`);

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
let recorder: SnapshotRecorder;
let tokenId: number;
let holderIds: number[];
let completeRun: number;
let partialRun: number;

async function evidenceFor(classification: 'verified_fact' | 'heuristic', n: number) {
  return recorder.recordEvidence({
    chainId: 'robinhood',
    classification,
    explanation: `Bukti uji ${n}`,
    txHash: hash(n),
    blockNumber: 1000 + n,
    heuristicName: classification === 'heuristic' ? 'common_direct_funder' : null,
    confidence: classification === 'heuristic' ? 0.64 : null,
    fetchedAt: FETCHED_AT,
  });
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  recorder = new SnapshotRecorder(db as unknown as Database);

  const insertAddress = async (raw: string) =>
    (
      await db
        .insert(schema.addresses)
        .values({ chainId: 'robinhood', address: raw, addressNormalized: normalizeAddress('evm', raw) })
        .returning()
    )[0];
  const tokenAddress = await insertAddress('0x' + 'AA'.repeat(20));
  tokenId = (
    await db
      .insert(schema.tokens)
      .values({ chainId: 'robinhood', addressId: tokenAddress.id, standard: 'erc20', decimals: 18 })
      .returning()
  )[0].id;
  holderIds = [];
  for (const prefix of ['B1', 'B2', 'B3']) holderIds.push((await insertAddress('0x' + prefix.repeat(20))).id);

  const runs = await db
    .insert(schema.providerRuns)
    .values([
      { provider: 'robinhood-rpc', kind: 'rpc', chainId: 'robinhood', operation: 'token.metadata', status: 'complete', fetchedAt: FETCHED_AT },
      { provider: 'blockscout', kind: 'explorer', chainId: 'robinhood', operation: 'token.holders', status: 'partial', missingFields: ['holders.labels'], fetchedAt: FETCHED_AT },
    ])
    .returning();
  [completeRun, partialRun] = runs.map((run) => run.id);
}, 60_000);

afterAll(async () => {
  await client.close();
});

describe('recordEvidence', () => {
  it('idempotent: isi yang sama menghasilkan id dan baris yang sama', async () => {
    const first = await evidenceFor('verified_fact', 1);
    const second = await evidenceFor('verified_fact', 1);
    expect(second).toBe(first);
    const [{ total }] = await db
      .select({ total: count() })
      .from(schema.evidence)
      .where(eq(schema.evidence.id, first));
    expect(total).toBe(1);
  });
});

describe('recordSnapshot', () => {
  it('menurunkan status data, tingkat risiko, dan klasifikasi temuan', async () => {
    const fact1 = await evidenceFor('verified_fact', 11);
    const fact2 = await evidenceFor('verified_fact', 12);
    const guess = await evidenceFor('heuristic', 13);

    const result = await recorder.recordSnapshot({
      tokenId,
      blockNumber: 500,
      fetchedAt: FETCHED_AT,
      providerRunIds: [completeRun, partialRun],
      market: { priceUsd: 0.004213, liquidityUsd: 612400, holderCount: 3482 },
      concentration: { top10Pct: 61.8, top50Pct: 78.3 },
      riskScore: 68,
      holders: holderIds.map((addressId, index) => ({
        addressId,
        rank: index + 1,
        balanceRaw: `${(3 - index) * 1000}`,
        sharePct: (3 - index) * 10,
      })),
      findings: [
        { code: 'common_funding', title: 'Pendanaan bersama', description: '-', severity: 'medium', evidenceIds: [fact1, fact2, guess] },
        { code: 'owner_can_change_tax', title: 'Owner bisa ubah pajak', description: '-', severity: 'high', evidenceIds: [fact1] },
        { code: 'lp_lock_claim', title: 'Klaim LP terkunci', description: '-', severity: 'medium', evidenceIds: [] },
      ],
      contractChecks: [
        { code: 'tax', label: 'Pajak', status: 'fail', value: 'Jual 5%', classification: 'verified_fact', evidenceIds: [fact1] },
        { code: 'honeypot', label: 'Simulasi jual', status: 'unknown', value: 'Belum disimulasikan' },
      ],
    });

    expect(result.dataStatus).toBe('partial');
    expect(result.riskLevel).toBe('high');
    expect(result.findings).toEqual([
      { code: 'common_funding', classification: 'heuristic' },
      { code: 'owner_can_change_tax', classification: 'verified_fact' },
      { code: 'lp_lock_claim', classification: 'assumption' },
    ]);

    const [snapshot] = await db.select().from(schema.tokenSnapshots).where(eq(schema.tokenSnapshots.id, result.snapshotId));
    expect(snapshot).toMatchObject({
      blockNumber: 500,
      dataStatus: 'partial',
      priceUsd: '0.004213000000000000',
      holderCount: 3482,
      top10Pct: '61.8000',
      riskScore: 68,
      riskLevel: 'high',
    });
    const holderRows = await db.select().from(schema.holders).where(eq(schema.holders.snapshotId, result.snapshotId));
    expect(holderRows).toHaveLength(3);
    const links = await db.select().from(schema.riskFindingEvidence);
    expect(links).toHaveLength(4);
    const sources = await db.select().from(schema.tokenSnapshotSources).where(eq(schema.tokenSnapshotSources.snapshotId, result.snapshotId));
    expect(sources).toHaveLength(2);
  });

  it('merekam ulang blok yang sama mengganti isinya, bukan menggandakan', async () => {
    const fact = await evidenceFor('verified_fact', 21);
    const result = await recorder.recordSnapshot({
      tokenId,
      blockNumber: 500,
      fetchedAt: new Date('2026-10-03T05:00:00Z'),
      providerRunIds: [completeRun],
      riskScore: null,
      holders: [{ addressId: holderIds[0], rank: 1, balanceRaw: '9000', sharePct: 90 }],
      findings: [{ code: 'owner_can_change_tax', title: 'Owner bisa ubah pajak', description: '-', severity: 'high', evidenceIds: [fact] }],
    });
    expect(result).toMatchObject({ dataStatus: 'complete', riskLevel: 'unknown' });

    const snapshots = await db.select().from(schema.tokenSnapshots).where(eq(schema.tokenSnapshots.tokenId, tokenId));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ riskScore: null, riskLevel: 'unknown', priceUsd: null });
    expect(await db.select().from(schema.holders).where(eq(schema.holders.snapshotId, result.snapshotId))).toHaveLength(1);
    expect(await db.select().from(schema.riskFindings).where(eq(schema.riskFindings.snapshotId, result.snapshotId))).toHaveLength(1);
    expect(await db.select().from(schema.contractChecks).where(eq(schema.contractChecks.snapshotId, result.snapshotId))).toHaveLength(0);
  });

  it('menolak provider atau bukti yang tidak ada tanpa menulis apa pun', async () => {
    await expect(
      recorder.recordSnapshot({ tokenId, blockNumber: 600, fetchedAt: FETCHED_AT, providerRunIds: [completeRun, 999999] }),
    ).rejects.toThrow(new SnapshotRecordError('Provider run tidak ditemukan: 999999'));
    await expect(
      recorder.recordSnapshot({
        tokenId,
        blockNumber: 600,
        fetchedAt: FETCHED_AT,
        providerRunIds: [completeRun],
        findings: [{ code: 'x', title: 'x', description: 'x', severity: 'low', evidenceIds: [888888] }],
      }),
    ).rejects.toThrow('Bukti tidak ditemukan: 888888');
    const atBlock600 = await db.select().from(schema.tokenSnapshots).where(eq(schema.tokenSnapshots.blockNumber, 600));
    expect(atBlock600).toHaveLength(0);
  });

  it('membatalkan seluruh perekaman bila satu bagian melanggar aturan', async () => {
    await expect(
      recorder.recordSnapshot({
        tokenId,
        blockNumber: 700,
        fetchedAt: FETCHED_AT,
        providerRunIds: [completeRun],
        // Pemeriksaan yang sudah dijalankan wajib punya klasifikasi.
        contractChecks: [{ code: 'tax', label: 'Pajak', status: 'fail', value: 'Jual 5%' }],
      }),
    ).rejects.toThrow();
    const atBlock700 = await db.select().from(schema.tokenSnapshots).where(eq(schema.tokenSnapshots.blockNumber, 700));
    expect(atBlock700).toHaveLength(0);
  });

  it('snapshot tanpa provider berstatus unavailable', async () => {
    const result = await recorder.recordSnapshot({ tokenId, blockNumber: 800, fetchedAt: FETCHED_AT, providerRunIds: [] });
    expect(result.dataStatus).toBe('unavailable');
  });
});
