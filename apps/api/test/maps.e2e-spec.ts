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
import { createTestDatabase, insertEvmAddress, type TestDatabase } from './support/database.js';

const TOKEN = '0x' + '7a'.repeat(20);
const H1 = '0x' + 'a1'.repeat(20);
const H2 = '0x' + 'a2'.repeat(20);
const POOL = '0x' + 'b0'.repeat(20);
const FUNDER = '0x' + 'f1'.repeat(20);
const GRAND = '0x' + 'f2'.repeat(20);
const CONNECTOR = '0x' + 'c1'.repeat(20);
const BARE = '0x' + '7c'.repeat(20);
const SCANNED_AT = new Date('2026-10-03T04:30:00Z');
const NOW = new Date('2026-10-03T05:00:00Z');

let seq = 0;
const hash = () => `0x${(++seq).toString(16).padStart(64, '0')}`;
const at = (block: number) => new Date(Date.UTC(2026, 8, 1) + block * 60_000);

const native = (from: string, to: string, block: number): IndexedNativeTransfer => ({
  txHash: hash(),
  kind: 'transaction',
  tracePath: '',
  from,
  to,
  amountRaw: '2000000000000000000',
  blockNumber: block,
  timestamp: at(block),
});

const tokenTransfer = (from: string, to: string, block: number): IndexedTokenTransfer => ({
  txHash: hash(),
  logIndex: 0,
  token: { address: TOKEN, symbol: 'NBLA', name: 'Nebula Finance', decimals: 18 },
  from,
  to,
  amountRaw: '5000000000000000000000',
  blockNumber: block,
  timestamp: at(block),
});

const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };

function scanOf(
  address: string,
  nativeTransfers: IndexedNativeTransfer[],
  tokenTransfers: IndexedTokenTransfer[] = [],
  fetchedAt = SCANNED_AT,
): AddressFlowCollection {
  return {
    chainId: 'robinhood',
    address,
    fetchedAt,
    runs: [],
    head: { blockNumber: 1_000, timestamp: fetchedAt },
    nativeTransfers,
    tokenTransfers,
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 1_000,
      windowFrom: at(0),
      windowTo: fetchedAt,
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

interface NodeBody {
  address: string;
  role: string;
  distance: number;
}
interface EdgeBody {
  kind: string;
  from: string;
  to: string;
}

describe('GET /api/maps/:chain/:token', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let ingestion: FundFlowIngestionService;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    ingestion = new FundFlowIngestionService(db as unknown as Database);
    // Pendana F mendanai H1 dan H2; G mendanai F. Pool menjual ke H1; H1 → C → H2.
    await ingestion.persist(scanOf(H1, [native(FUNDER, H1, 100)], [tokenTransfer(POOL, H1, 300), tokenTransfer(H1, CONNECTOR, 310)]), 'evm');
    await ingestion.persist(scanOf(H2, [native(FUNDER, H2, 110)], [tokenTransfer(CONNECTOR, H2, 320)]), 'evm');
    await ingestion.persist(scanOf(FUNDER, [native(GRAND, FUNDER, 50)]), 'evm');

    const byAddress = async (raw: string) => {
      const [row] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, raw));
      return row;
    };
    const [tokenAddress, h1, h2, pool] = await Promise.all([TOKEN, H1, H2, POOL].map(byAddress));
    await db.update(schema.addresses).set({ isContract: true }).where(eq(schema.addresses.id, pool.id));
    await db.insert(schema.labels).values({
      addressId: pool.id,
      labelType: 'liquidity_pool',
      name: 'Pool NBLA/WETH',
      source: 'external',
      sourceName: 'Blockscout',
      classification: 'external_label',
    });
    const [token] = await db.select().from(schema.tokens).where(eq(schema.tokens.addressId, tokenAddress.id));
    const [snapshot] = await db
      .insert(schema.tokenSnapshots)
      .values({ tokenId: token.id, blockNumber: 900, fetchedAt: SCANNED_AT, dataStatus: 'complete' })
      .returning();
    await db.insert(schema.holders).values([
      { snapshotId: snapshot.id, addressId: h1.id, rank: 1, balanceRaw: '400', sharePct: '40.000000' },
      { snapshotId: snapshot.id, addressId: h2.id, rank: 2, balanceRaw: '250', sharePct: '25.000000' },
      { snapshotId: snapshot.id, addressId: pool.id, rank: 3, balanceRaw: '200', sharePct: '20.000000' },
    ]);

    // Token yang sudah dikenal tapi belum punya snapshot.
    const bare = await insertEvmAddress(db, 'robinhood', BARE);
    await db.insert(schema.tokens).values({ chainId: 'robinhood', addressId: bare.id, standard: 'erc20' });

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

  const url = (query = '', token = TOKEN, chain = 'robinhood') => `/api/maps/${chain}/${token}${query}`;
  const roles = (body: { nodes: NodeBody[] }) => body.nodes.map((node) => [node.address, node.role, node.distance]);
  const links = (body: { edges: EdgeBody[] }) => body.edges.map((edge) => [edge.kind, edge.from, edge.to]);
  let firstMapId: number;

  it('membentuk peta saat pertama diminta: holder, pendana, penghubung, dan garis dengan bukti transaksinya', async () => {
    const { body } = await request(app.getHttpServer()).get(url()).expect(200);
    firstMapId = body.map.id;
    expect(body).toMatchObject({
      chain: { id: 'robinhood', nativeSymbol: 'ETH' },
      token: { address: TOKEN, symbol: 'NBLA', decimals: 18 },
      map: { reused: false, holderLimit: 50, fundingDepth: 2, radius: 2, status: 'complete', statusReason: null, missingFields: [] },
      snapshot: { blockNumber: 900, fetchedAt: SCANNED_AT.toISOString(), sources: [] },
      dataStatus: 'complete',
    });
    expect(roles(body)).toEqual([
      [H1, 'holder', 0],
      [H2, 'holder', 0],
      [POOL, 'holder', 0],
      [FUNDER, 'funder', 1],
      [GRAND, 'funder', 2],
      [CONNECTOR, 'connector', 1],
    ]);
    expect(body.nodes[2]).toMatchObject({ sharePct: 20, isContract: true, labels: [{ type: 'liquidity_pool', sourceName: 'Blockscout' }] });
    expect(links(body)).toEqual([
      ['funding', FUNDER, H1],
      ['funding', FUNDER, H2],
      ['funding', GRAND, FUNDER],
      ['token_transfer', POOL, H1],
      ['token_transfer', H1, CONNECTOR],
      ['token_transfer', CONNECTOR, H2],
    ]);
    expect(body.edges[0]).toMatchObject({
      transferKind: 'native',
      asset: { type: 'native', symbol: 'ETH', decimals: 18 },
      amount: '2',
      blockNumber: 100,
      classification: 'verified_fact',
    });
    expect(body.edges[0].id).toMatch(/^native:\d+$/);
    expect(body.edges[3]).toMatchObject({ transferKind: 'token', asset: { type: 'token', address: TOKEN, symbol: 'NBLA' }, amount: '5000' });
    expect(body.caveats[0]).toContain('belum tentu dimiliki orang yang sama');
    expect(body.caveats.join(' ')).toContain('tidak ditelusuri lebih jauh');
  });

  it('memakai ulang peta tersimpan, dan radius memotong wallet yang lebih jauh', async () => {
    const same = await request(app.getHttpServer()).get(url()).expect(200);
    expect(same.body.map).toMatchObject({ id: firstMapId, reused: true });

    const { body } = await request(app.getHttpServer()).get(url('?radius=1')).expect(200);
    expect(body.map).toMatchObject({ id: firstMapId, reused: true, radius: 1, fundingDepth: 2 });
    expect(body.nodes.map((node: NodeBody) => node.address)).toEqual([H1, H2, POOL, FUNDER, CONNECTOR]);
    expect(links(body)).not.toContainEqual(['funding', GRAND, FUNDER]);
    expect(body.caveats.join(' ')).toContain('Hanya wallet sampai 1 langkah');

    const holdersOnly = await request(app.getHttpServer()).get(url('?radius=0')).expect(200);
    expect(holdersOnly.body.nodes.map((node: NodeBody) => node.role)).toEqual(['holder', 'holder', 'holder']);
    expect(links(holdersOnly.body)).toEqual([['token_transfer', POOL, H1]]);
  });

  it('membentuk peta baru bila radius lebih dalam atau jumlah holder berbeda', async () => {
    const deeper = await request(app.getHttpServer()).get(url('?radius=3')).expect(200);
    expect(deeper.body.map).toMatchObject({ reused: false, fundingDepth: 3, radius: 3 });
    expect(deeper.body.map.id).not.toBe(firstMapId);

    const { body } = await request(app.getHttpServer()).get(url('?holders=1')).expect(200);
    expect(body.map).toMatchObject({ reused: false, holderLimit: 1 });
    expect(roles(body)).toEqual([
      [H1, 'holder', 0],
      [FUNDER, 'funder', 1],
      [GRAND, 'funder', 2],
    ]);
  });

  it('membuka peta tersimpan lewat ?map= untuk hasil yang sama', async () => {
    const { body } = await request(app.getHttpServer()).get(url(`?map=${firstMapId}`)).expect(200);
    expect(body.map).toMatchObject({ id: firstMapId, reused: true, radius: 2 });
    expect(body.nodes).toHaveLength(6);
    await request(app.getHttpServer()).get(url(`?map=${firstMapId}&radius=3`)).expect(400);
    await request(app.getHttpServer()).get(url('?map=99999')).expect(404);
    await request(app.getHttpServer()).get(url(`?map=${firstMapId}`, BARE)).expect(404);
  });

  it('membentuk ulang peta bila ada pemindaian baru sesudah peta dibentuk', async () => {
    await ingestion.persist(scanOf(CONNECTOR, [], [], new Date(NOW.getTime() + 60_000)), 'evm');
    const { body } = await request(app.getHttpServer()).get(url()).expect(200);
    expect(body.map.reused).toBe(false);
    expect(body.map.id).not.toBe(firstMapId);
  });

  it('menolak masukan yang salah dan menjelaskan data yang belum ada', async () => {
    const server = app.getHttpServer();
    await request(server).get(url('?radius=6')).expect(400);
    await request(server).get(url('?radius=-1')).expect(400);
    await request(server).get(url('?holders=0')).expect(400);
    await request(server).get(url('?map=abc')).expect(400);
    await request(server).get(url('', 'bukan-address')).expect(400);
    await request(server).get(url('', TOKEN, 'mars')).expect(404);
    const unknown = await request(server).get(url('', '0x' + '99'.repeat(20))).expect(404);
    expect(unknown.body.message).toContain('belum pernah diambil datanya');
    const bare = await request(server).get(url('', BARE)).expect(404);
    expect(bare.body.message).toContain('Belum ada snapshot holder');
  });
});
