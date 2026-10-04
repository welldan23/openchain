import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import type { IndexedNativeTransfer, IndexedTokenTransfer } from '../src/providers/provider.types.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const TOKEN = '0x' + '5e'.repeat(20);
const B1 = '0x' + 'b1'.repeat(20);
const B2 = '0x' + 'b2'.repeat(20);
const B3 = '0x' + 'b3'.repeat(20);
const B4 = '0x' + 'b4'.repeat(20);
const POOL = '0x' + 'a0'.repeat(20);
const SYBIL = '0x' + '5b'.repeat(20);
const ROUTER = '0x' + 'c0'.repeat(20);
const SCANNED_AT = new Date('2026-10-03T04:30:00Z');
const NOW = new Date('2026-10-03T05:00:00Z');

let seq = 0;
const hash = () => `0x${(++seq).toString(16).padStart(64, '0')}`;
// Satu blok per menit supaya rentang waktu mudah dibaca.
const at = (block: number) => new Date(Date.UTC(2026, 8, 1) + block * 60_000);

const native = (from: string, to: string, block: number, amountRaw: string): IndexedNativeTransfer => ({
  txHash: hash(),
  kind: 'transaction',
  tracePath: '',
  from,
  to,
  amountRaw,
  blockNumber: block,
  timestamp: at(block),
});
const token = (from: string, to: string, block: number): IndexedTokenTransfer => ({
  txHash: hash(),
  logIndex: 0,
  token: { address: TOKEN, symbol: 'SYB', name: 'Sybil Coin', decimals: 18 },
  from,
  to,
  amountRaw: '1000000000000000000000',
  blockNumber: block,
  timestamp: at(block),
});

const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };
function scanOf(address: string, nativeTransfers: IndexedNativeTransfer[], tokenTransfers: IndexedTokenTransfer[]): AddressFlowCollection {
  return {
    chainId: 'robinhood',
    address,
    fetchedAt: SCANNED_AT,
    runs: [],
    head: { blockNumber: 1_000, timestamp: SCANNED_AT },
    nativeTransfers,
    tokenTransfers,
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 1_000,
      windowFrom: at(0),
      windowTo: SCANNED_AT,
      nativeScanned: true,
      tokensScanned: true,
      internalScanned: true,
      status: 'complete',
      statusReason: null,
      missingFields: [],
    },
    partyLabels: [],
    failure: null,
  };
}

interface EventBody {
  kind: string;
  members: string[];
  confidence: string;
  blockNumber: number | null;
  windowSeconds: number;
  transactions: Array<{ action: string; from: string; to: string; amount: string | null; classification: string }>;
}

describe('GET /api/maps/:chain/:token/coordination', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const ingestion = new FundFlowIngestionService(db as unknown as Database);
    // SYBIL mendanai B1–B3 dalam 3 menit dengan jumlah hampir sama; ketiganya membeli di blok 300,
    // lalu B1 (ke pool) dan B2 (ke router di luar peta) menjual dalam 2 menit. B4 membeli sendiri di blok lain.
    await ingestion.persist(scanOf(B1, [native(SYBIL, B1, 200, '1000000000000000000')], [token(POOL, B1, 300), token(B1, POOL, 400)]), 'evm');
    await ingestion.persist(scanOf(B2, [native(SYBIL, B2, 201, '1005000000000000000')], [token(POOL, B2, 300), token(B2, ROUTER, 402)]), 'evm');
    await ingestion.persist(scanOf(B3, [native(SYBIL, B3, 203, '1002000000000000000')], [token(POOL, B3, 300)]), 'evm');
    await ingestion.persist(scanOf(B4, [], [token(POOL, B4, 500)]), 'evm');
    await ingestion.persist(scanOf(SYBIL, [], []), 'evm');

    const byAddress = async (raw: string) => (await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, raw)))[0];
    const [tokenAddress, b1, b2, b3, b4, pool, router] = await Promise.all([TOKEN, B1, B2, B3, B4, POOL, ROUTER].map(byAddress));
    await db.update(schema.addresses).set({ isContract: true }).where(eq(schema.addresses.id, pool.id));
    await db.update(schema.addresses).set({ isContract: true }).where(eq(schema.addresses.id, router.id));
    await db.insert(schema.labels).values({
      addressId: router.id,
      labelType: 'router',
      name: 'DEX Router',
      source: 'external',
      sourceName: 'Blockscout',
      classification: 'external_label',
    });
    const [row] = await db.select().from(schema.tokens).where(eq(schema.tokens.addressId, tokenAddress.id));
    const [snapshot] = await db
      .insert(schema.tokenSnapshots)
      .values({ tokenId: row.id, blockNumber: 900, fetchedAt: SCANNED_AT, dataStatus: 'complete' })
      .returning();
    await db.insert(schema.holders).values(
      [pool, b1, b2, b3, b4].map((holder, index) => ({
        snapshotId: snapshot.id,
        addressId: holder.id,
        rank: index + 1,
        balanceRaw: '100',
        sharePct: index === 0 ? '50.000000' : '5.000000',
      })),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => NOW })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  const url = (path = '') => `/api/maps/robinhood/${TOKEN}${path}`;

  it('belum ada peta: 404 dengan petunjuk', async () => {
    const { body } = await request(app.getHttpServer()).get(url('/coordination')).expect(404);
    expect(body.message).toContain('Belum ada peta');
  });

  it('mendeteksi pendanaan beruntun, jumlah mirip, beli di blok sama, dan jual berdekatan', async () => {
    const map = await request(app.getHttpServer()).get(url()).expect(200);
    const { body } = await request(app.getHttpServer()).get(url(`/coordination?map=${map.body.map.id}`)).expect(200);
    expect(body.analysis.heuristic).toBe('openchain-coordination-v1');
    const summary = body.coordination.map((item: EventBody) => [item.kind, [...item.members].sort(), item.confidence, item.blockNumber, item.windowSeconds]);
    expect(summary).toEqual([
      ['funding_burst', [B1, B2, B3], 'medium', null, 180],
      ['similar_amount', [B1, B2, B3], 'low', null, 180],
      ['same_block_buy', [B1, B2, B3], 'high', 300, 0],
      ['coordinated_sell', [B1, B2], 'medium', null, 120],
    ]);
    const bundle = body.coordination[2];
    expect(bundle.classification).toBe('heuristic');
    expect(bundle.transactions).toHaveLength(3);
    expect(bundle.transactions[0]).toMatchObject({ action: 'buy', from: POOL, amount: '1000', classification: 'verified_fact' });
    expect(body.coordination[0].transactions[0]).toMatchObject({ action: 'funding', from: SYBIL, to: B1, amount: '1', transferKind: 'native' });
    expect(body.coordination[0].detail).toContain('3 wallet didanai');
    expect(body.caveats[0]).toContain('dugaan');

    // Disimpan sekali: permintaan berikutnya memakai hasil yang sama, dan respons peta ikut memuatnya.
    const again = await request(app.getHttpServer()).get(url('/coordination')).expect(200);
    expect(again.body.analysis.computedAt).toBe(body.analysis.computedAt);
    const mapAgain = await request(app.getHttpServer()).get(url(`?map=${map.body.map.id}`)).expect(200);
    expect(mapAgain.body.coordination).toEqual(body.coordination);
    expect(mapAgain.body.coordinationAnalysis).toEqual(body.analysis);
  });

  it('kelompok yang menerima token di blok yang sama ikut diberi label bot dugaan', async () => {
    const { body } = await request(app.getHttpServer()).get(url()).expect(200);
    const b1 = body.nodes.find((node: { address: string }) => node.address === B1);
    expect(b1.labels[0]).toMatchObject({ type: 'bot', source: 'heuristic' });
    expect(body.clusters[0].labels).toEqual(expect.arrayContaining(['common_funding', 'bundled_or_sniper_activity']));
  });

  it('detail temuan: transaksi beserta jenisnya, pihak-pihak, blok, dan kelompok terkait', async () => {
    const list = await request(app.getHttpServer()).get(url('/coordination')).expect(200);
    const bundleId = list.body.coordination.find((item: { kind: string }) => item.kind === 'same_block_buy').id;
    const { body } = await request(app.getHttpServer()).get(url(`/coordination/${encodeURIComponent(bundleId)}`)).expect(200);
    expect(body.finding).toMatchObject({ id: bundleId, kind: 'same_block_buy', blockNumber: 300, classification: 'heuristic' });
    expect(body.finding.transactions).toHaveLength(3);
    expect(body.finding.transactions[0]).toHaveProperty('movement');
    expect(body.blocks).toEqual([{ blockNumber: 300, transactionCount: 3 }]);
    expect(body.sameBlockTransactions).toBe(3);
    const party = (address: string) => body.parties.find((item: { address: string }) => item.address === address);
    expect(party(B1)).toMatchObject({ role: 'holder', member: true, sharePct: 5 });
    expect(party(B1).clusterId).not.toBeNull();
    expect(party(POOL)).toMatchObject({ role: 'holder', member: false, isContract: true });
    expect(body.relatedClusters).toEqual([expect.objectContaining({ membersInFinding: 3, labels: expect.arrayContaining(['bundled_or_sniper_activity']) })]);
    expect(body.caveats[0]).toContain('bot publik');

    const sellId = list.body.coordination.find((item: { kind: string }) => item.kind === 'coordinated_sell').id;
    const sell = await request(app.getHttpServer()).get(url(`/coordination/${encodeURIComponent(sellId)}?map=${list.body.map.id}`)).expect(200);
    // Router bukan holder: tetap tampil sebagai pihak, dengan label dari sumbernya.
    expect(sell.body.parties.find((item: { address: string }) => item.address === ROUTER)).toMatchObject({
      role: null,
      sharePct: null,
      member: false,
      isContract: true,
      labels: [expect.objectContaining({ type: 'router', name: 'DEX Router', source: 'external' })],
    });
    expect(sell.body.caveats[0]).toContain('reaksi pasar');
  });

  it('detail temuan yang tidak ada dijawab 404', async () => {
    const server = app.getHttpServer();
    const missing = await request(server).get(url('/coordination/same_block_buy:1')).expect(404);
    expect(missing.body.message).toContain('tidak ada di peta mana pun');
    const list = await request(server).get(url('/coordination')).expect(200);
    const other = await request(server).get(url(`/coordination/same_block_buy:1?map=${list.body.map.id}`)).expect(404);
    expect(other.body.message).toContain(`tidak ada di peta #${list.body.map.id}`);
  });

  it('menolak parameter peta yang salah', async () => {
    await request(app.getHttpServer()).get(url('/coordination?map=abc')).expect(400);
    await request(app.getHttpServer()).get(url('/coordination?map=99999')).expect(404);
  });
});
