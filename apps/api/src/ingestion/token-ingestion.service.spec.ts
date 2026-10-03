import type { PGlite } from '@electric-sql/pglite';
import { asc, count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { createTestDatabase, type TestDatabase } from '../../test/support/database.js';
import type { TokenCollection } from '../chains/chain-adapter.types.js';
import { ChainNotSupportedError } from '../chains/chain-registry.js';
import type { Database } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import type { ProviderRunRecord } from '../providers/provider.types.js';
import { SnapshotRecorder } from '../snapshots/snapshot-recorder.service.js';
import { TokenIngestionService } from './token-ingestion.service.js';

const TOKEN = '0x008Df4b3E857D06c4603Aeb11F267ccD32ce2005';
const HOLDER_A = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
const HOLDER_B = '0x1d48963DD8FAdA6aB5C2C7b92Eba81ECC5030270';
const DEPLOYER = '0xfbfeaf0da0f2fde5c66df570133ae35f3eb58c9a';
const DEPLOY_TX = `0x${'cd'.repeat(32)}`;
const FETCHED_AT = new Date('2026-10-03T07:00:00Z');
const BLOCK = 78_900_000;

function run(key: string, overrides: Partial<ProviderRunRecord> = {}): ProviderRunRecord {
  const base: Record<string, Pick<ProviderRunRecord, 'provider' | 'kind' | 'operation'>> = {
    rpc: { provider: 'robinhood-rpc', kind: 'rpc', operation: 'token.state' },
    explorer: { provider: 'blockscout', kind: 'explorer', operation: 'token.contract' },
    indexer: { provider: 'blockscout', kind: 'indexed_data', operation: 'token.holders' },
    market: { provider: 'dexscreener', kind: 'market_data', operation: 'token.market' },
  };
  return {
    key,
    ...base[key],
    subject: TOKEN.toLowerCase(),
    status: 'complete',
    errorReason: null,
    missingFields: [],
    blockFrom: key === 'rpc' ? BLOCK : null,
    blockTo: key === 'rpc' ? BLOCK : null,
    startedAt: FETCHED_AT,
    fetchedAt: FETCHED_AT,
    ...overrides,
  };
}

function collection(overrides: Partial<TokenCollection> = {}): TokenCollection {
  const token = TOKEN.toLowerCase();
  return {
    chainId: 'robinhood',
    address: TOKEN,
    runs: [run('rpc'), run('explorer'), run('indexer'), run('market')],
    failure: null,
    blockNumber: BLOCK,
    blockTimestamp: new Date('2026-10-03T06:59:59Z'),
    fetchedAt: FETCHED_AT,
    token: {
      standard: 'erc20',
      name: 'Robinhood',
      symbol: 'ROBINHOOD',
      decimals: 18,
      totalSupplyRaw: '1000000000000000000000000000',
      sourceVerified: true,
      deployer: DEPLOYER,
      deployTxHash: DEPLOY_TX,
      deployedAt: new Date('2026-09-09T11:40:00Z'),
    },
    market: {
      priceUsd: '0.001519',
      priceChange24hPct: '-17.49',
      marketCapUsd: '1519103',
      fdvUsd: '1519103',
      liquidityUsd: '118130.6',
      volume24hUsd: '79649.31',
      txCount24h: 383,
    },
    holderCount: 1250,
    holders: [
      {
        address: HOLDER_A,
        isContract: false,
        rank: 1,
        balanceRaw: '600000000000000000000000000',
        sharePct: '60.000000',
        labels: [{ type: 'exchange', name: 'Binance: Hot Wallet 20' }],
      },
      { address: HOLDER_B, isContract: true, rank: 2, balanceRaw: '300000000000000000000000000', sharePct: '30.000000', labels: [] },
    ],
    concentration: { top10Pct: '90.0000', top50Pct: '90.0000' },
    checks: [
      {
        code: 'verified',
        label: 'Source code',
        status: 'pass',
        value: 'Terverifikasi di explorer',
        description: null,
        classification: 'external_label',
        evidence: [
          {
            classification: 'external_label',
            explanation: 'Blockscout menyatakan source code kontrak ini terverifikasi.',
            subject: `${token}:verified@${BLOCK}`,
            runKey: 'explorer',
            contractAddress: token,
          },
        ],
      },
      {
        code: 'ownership',
        label: 'Kepemilikan kontrak',
        status: 'pass',
        value: 'Owner sudah di-renounce',
        description: null,
        classification: 'verified_fact',
        evidence: [
          {
            classification: 'verified_fact',
            explanation: `owner() pada blok ${BLOCK} mengembalikan address nol.`,
            subject: `${token}:owner@${BLOCK}`,
            runKey: 'rpc',
            blockNumber: BLOCK,
            method: 'owner()',
            contractAddress: token,
          },
        ],
      },
      {
        code: 'honeypot',
        label: 'Simulasi jual',
        status: 'unknown',
        value: 'Belum disimulasikan',
        description: null,
        classification: null,
        evidence: [],
      },
    ],
    ...overrides,
  };
}

let client: PGlite;
let db: TestDatabase;
let service: TokenIngestionService;

async function total(table: PgTable) {
  const [{ value }] = await db.select({ value: count() }).from(table);
  return value;
}

beforeAll(async () => {
  ({ client, db } = await createTestDatabase());
}, 60_000);

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  // Kosongkan data uji; tabel chains (hasil migrasi) tetap.
  await client.exec('TRUNCATE addresses, provider_runs RESTART IDENTITY CASCADE');
  const database = db as unknown as Database;
  service = new TokenIngestionService(database, new SnapshotRecorder(database), {
    adapter: () => ({ chainId: 'robinhood', collectToken: async () => collection(), smokeTest: async () => { throw new Error('tidak dipakai'); } }),
  });
});

describe('TokenIngestionService.persist', () => {
  it('menyimpan token, holder, label, cek kontrak, bukti, dan snapshot', async () => {
    const result = await service.persist(collection(), 'evm');
    expect(result.failure).toBeNull();
    expect(result.snapshot).toEqual({ id: expect.any(Number), blockNumber: BLOCK, dataStatus: 'complete' });
    expect(result.checks).toEqual({ fail: 0, warn: 0, unknown: 1, pass: 2 });
    expect(result.runs).toHaveLength(4);

    const [token] = await db.select().from(schema.tokens);
    expect(token).toMatchObject({
      chainId: 'robinhood',
      name: 'Robinhood',
      symbol: 'ROBINHOOD',
      decimals: 18,
      totalSupplyRaw: '1000000000000000000000000000',
      deployTxHash: DEPLOY_TX,
      sourceVerified: true,
    });

    const [snapshot] = await db.select().from(schema.tokenSnapshots);
    expect(snapshot).toMatchObject({
      blockNumber: BLOCK,
      dataStatus: 'complete',
      totalSupplyRaw: '1000000000000000000000000000',
      priceUsd: '0.001519000000000000',
      liquidityUsd: '118130.60',
      holderCount: 1250,
      txCount24h: 383,
      top10Pct: '90.0000',
      riskScore: null,
      riskLevel: 'unknown',
    });

    const holders = await db.select().from(schema.holders).orderBy(asc(schema.holders.rank));
    expect(holders.map((holder) => [holder.rank, holder.sharePct])).toEqual([
      [1, '60.000000'],
      [2, '30.000000'],
    ]);

    const [label] = await db.select().from(schema.labels);
    const runs = await db.select().from(schema.providerRuns).orderBy(asc(schema.providerRuns.id));
    const indexerRun = runs.find((row) => row.kind === 'indexed_data')!;
    expect(label).toMatchObject({
      labelType: 'exchange',
      name: 'Binance: Hot Wallet 20',
      source: 'external',
      sourceName: 'Blockscout',
      classification: 'external_label',
      providerRunId: indexerRun.id,
    });

    const evidence = await db.select().from(schema.evidence).orderBy(asc(schema.evidence.id));
    const rpcRun = runs.find((row) => row.kind === 'rpc')!;
    expect(evidence.map((row) => [row.classification, row.blockNumber, row.providerRunId])).toEqual([
      ['external_label', null, runs.find((row) => row.kind === 'explorer')!.id],
      ['verified_fact', BLOCK, rpcRun.id],
    ]);
    expect(rpcRun).toMatchObject({ subject: TOKEN.toLowerCase(), blockFrom: BLOCK, blockTo: BLOCK, status: 'complete' });

    const checks = await db.select().from(schema.contractChecks).orderBy(asc(schema.contractChecks.id));
    expect(checks.map((check) => [check.code, check.status, check.classification])).toEqual([
      ['verified', 'pass', 'external_label'],
      ['ownership', 'pass', 'verified_fact'],
      ['honeypot', 'unknown', null],
    ]);
  });

  it('idempotent: menyimpan ulang blok yang sama tidak menggandakan data', async () => {
    await service.persist(collection(), 'evm');
    await service.persist(collection(), 'evm');
    expect(await total(schema.tokens)).toBe(1);
    expect(await total(schema.tokenSnapshots)).toBe(1);
    expect(await total(schema.addresses)).toBe(4);
    expect(await total(schema.holders)).toBe(2);
    expect(await total(schema.labels)).toBe(1);
    expect(await total(schema.evidence)).toBe(2);
    expect(await total(schema.contractChecks)).toBe(3);
    // Run provider adalah log pengambilan, jadi setiap ingest menambah run baru.
    expect(await total(schema.providerRuns)).toBe(8);
    expect(await total(schema.tokenSnapshotSources)).toBe(4);
  });

  it('menandai snapshot partial bila explorer gagal', async () => {
    const result = await service.persist(
      collection({
        runs: [
          run('rpc'),
          run('explorer', { status: 'unavailable', errorReason: 'HTTP 403: diblokir proteksi bot (Cloudflare)' }),
          run('indexer'),
          run('market'),
        ],
      }),
      'evm',
    );
    expect(result.snapshot?.dataStatus).toBe('partial');
    expect(result.runs[1]).toMatchObject({ status: 'unavailable', errorReason: 'HTTP 403: diblokir proteksi bot (Cloudflare)' });
  });

  it('pengambilan gagal: run tersimpan beserta alasannya, tanpa token atau snapshot', async () => {
    const result = await service.persist(
      collection({
        failure: 'Data on-chain tidak bisa dibaca: Tidak ada respons dalam 15 detik',
        token: null,
        blockNumber: null,
        runs: [
          run('rpc', { status: 'unavailable', errorReason: 'Tidak ada respons dalam 15 detik', blockFrom: null, blockTo: null }),
          run('explorer'),
          run('indexer'),
          run('market'),
        ],
      }),
      'evm',
    );
    expect(result).toMatchObject({ failure: 'Data on-chain tidak bisa dibaca: Tidak ada respons dalam 15 detik', snapshot: null, tokenId: null });
    expect(await total(schema.providerRuns)).toBe(4);
    expect(await total(schema.tokens)).toBe(0);
    expect(await total(schema.tokenSnapshots)).toBe(0);
    const [rpcRun] = await db.select().from(schema.providerRuns).where(eq(schema.providerRuns.kind, 'rpc'));
    expect(rpcRun.errorReason).toBe('Tidak ada respons dalam 15 detik');
  });

  it('nilai yang gagal diambil tidak menimpa data lama, dan identifier asli tidak berubah', async () => {
    await service.persist(collection(), 'evm');
    const later = collection();
    await service.persist(
      {
        ...later,
        address: TOKEN.toLowerCase(),
        blockNumber: BLOCK + 100,
        token: { ...later.token!, name: null, sourceVerified: null, totalSupplyRaw: '900000000000000000000000000' },
        holders: later.holders!.map((holder) => ({ ...holder, address: holder.address.toLowerCase() })),
      },
      'evm',
    );
    const [token] = await db.select().from(schema.tokens);
    expect(token).toMatchObject({ name: 'Robinhood', sourceVerified: true, totalSupplyRaw: '900000000000000000000000000' });
    const stored = await db.select({ address: schema.addresses.address }).from(schema.addresses);
    expect(stored.map((row) => row.address)).toEqual(expect.arrayContaining([TOKEN, HOLDER_A, HOLDER_B]));
    const snapshots = await db.select().from(schema.tokenSnapshots).orderBy(asc(schema.tokenSnapshots.blockNumber));
    expect(snapshots.map((row) => [row.blockNumber, row.totalSupplyRaw])).toEqual([
      [BLOCK, '1000000000000000000000000000'],
      [BLOCK + 100, '900000000000000000000000000'],
    ]);
  });
});

describe('TokenIngestionService.ingest', () => {
  it('memakai adapter chain lalu menyimpan hasilnya', async () => {
    const result = await service.ingest('robinhood', TOKEN);
    expect(result.snapshot?.blockNumber).toBe(BLOCK);
  });

  it('menolak chain yang belum ada di database', async () => {
    await expect(service.ingest('dogechain', TOKEN)).rejects.toBeInstanceOf(ChainNotSupportedError);
  });
});
