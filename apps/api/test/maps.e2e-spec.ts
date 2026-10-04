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
const NO_HOLDERS = '0x' + '7d'.repeat(20);
const UNSCANNED = '0x' + '7e'.repeat(20);
const LONELY = '0x' + '7f'.repeat(20);
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
  id: string;
  kind: string;
  from: string;
  to: string;
  txHash: string;
}

describe('GET /api/maps/:chain/:token', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let ingestion: FundFlowIngestionService;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    ingestion = new FundFlowIngestionService(db as unknown as Database);
    // Pendana F mendanai H1 dan H2; G mendanai F. Pool menjual ke H1; H1 → C → H2, lalu C → H1.
    await ingestion.persist(
      scanOf(H1, [native(FUNDER, H1, 100)], [tokenTransfer(POOL, H1, 300), tokenTransfer(H1, CONNECTOR, 310), tokenTransfer(CONNECTOR, H1, 330)]),
      'evm',
    );
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

    // Token untuk empty state: snapshot tanpa holder, holder belum dipindai, dan holder yang tidak saling terhubung.
    const tokenWithSnapshot = async (raw: string, symbol: string) => {
      const address = await insertEvmAddress(db, 'robinhood', raw);
      const [row] = await db.insert(schema.tokens).values({ chainId: 'robinhood', addressId: address.id, standard: 'erc20', symbol }).returning();
      const [snap] = await db.insert(schema.tokenSnapshots).values({ tokenId: row.id, blockNumber: 900, fetchedAt: SCANNED_AT, dataStatus: 'partial' }).returning();
      return snap;
    };
    await tokenWithSnapshot(NO_HOLDERS, 'KOSONG');
    const unscannedSnap = await tokenWithSnapshot(UNSCANNED, 'BARU');
    const lonelySnap = await tokenWithSnapshot(LONELY, 'SEPI');
    const holderRows = async (snapshotId: number, seeds: string[]) => {
      const rows = await Promise.all(seeds.map((seed) => insertEvmAddress(db, 'robinhood', '0x' + seed.repeat(20))));
      await db.insert(schema.holders).values(rows.map((row, index) => ({ snapshotId, addressId: row.id, rank: index + 1, balanceRaw: '10', sharePct: '0.500000' })));
    };
    await holderRows(unscannedSnap.id, ['e1', 'e2']);
    await holderRows(lonelySnap.id, ['d1', 'd2']);
    for (const seed of ['d1', 'd2']) await ingestion.persist(scanOf('0x' + seed.repeat(20), []), 'evm');

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
      ['token_transfer', CONNECTOR, H1],
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

  it('detail garis: dua ujungnya, garis lain di antara mereka, dan bukti transaksinya', async () => {
    const map = await request(app.getHttpServer()).get(url(`?map=${firstMapId}`)).expect(200);
    const edge = map.body.edges.find((item: EdgeBody) => item.from === H1 && item.to === CONNECTOR);
    const { body } = await request(app.getHttpServer()).get(url(`/edges/${edge.id}?map=${firstMapId}`)).expect(200);
    expect(body).toMatchObject({
      chain: { id: 'robinhood' },
      token: { address: TOKEN, symbol: 'NBLA' },
      map: { id: firstMapId, status: 'complete' },
      edge: { id: edge.id, kind: 'token_transfer', from: H1, to: CONNECTOR, amount: '5000', blockNumber: 310, classification: 'verified_fact' },
      from: { address: H1, role: 'holder', sharePct: 40 },
      to: { address: CONNECTOR, role: 'connector', sharePct: 0 },
      transaction: { txHash: edge.txHash, blockNumber: 310 },
    });
    expect(body.edge).toHaveProperty('movement');
    expect(body.relatedEdges.map((item: EdgeBody) => [item.from, item.to])).toEqual([[CONNECTOR, H1]]);
    expect(body.transaction.movements).toHaveLength(1);
    expect(body.transaction.movements[0]).toMatchObject({ transferKind: 'token', from: { address: H1 }, to: { address: CONNECTOR } });
    expect(body.caveats[0]).toContain('tidak membuktikan keduanya dimiliki orang yang sama');

    const pool = map.body.edges.find((item: EdgeBody) => item.from === POOL);
    const poolEdge = await request(app.getHttpServer()).get(url(`/edges/${pool.id}`)).expect(200);
    // Tanpa ?map= dipakai peta terbaru yang memuat garis ini.
    expect(poolEdge.body.map.id).toBeGreaterThanOrEqual(firstMapId);
    expect(poolEdge.body.from.labels[0]).toMatchObject({ type: 'liquidity_pool', name: 'Pool NBLA/WETH' });
    expect(poolEdge.body.caveats.join(' ')).toContain('Pool NBLA/WETH adalah exchange, pool, atau kontrak');
  });

  it('mengelompokkan holder dengan pendana yang sama, menyimpan hasilnya, dan menandai node anggota', async () => {
    const { body } = await request(app.getHttpServer()).get(url(`/clusters?map=${firstMapId}`)).expect(200);
    expect(body).toMatchObject({
      map: { id: firstMapId, status: 'complete' },
      clustering: { heuristic: 'openchain-cluster-v1' },
      unclusteredHolders: 1,
    });
    expect(body.clusters).toHaveLength(1);
    const [cluster] = body.clusters;
    expect(cluster).toMatchObject({
      name: 'Kelompok A',
      labels: ['common_funding'],
      confidence: 'medium',
      classification: 'heuristic',
      hasDirectEvidence: false,
      holderCount: 2,
      sharePct: 65,
    });
    expect([...cluster.members].sort()).toEqual([H1, H2, FUNDER, GRAND, CONNECTOR].sort());
    expect(cluster.signals.map((signal: { id: string; matched: boolean }) => [signal.id, signal.matched])).toEqual([
      ['common-funder', true],
      ['funding-window', true],
      ['direct-transfer', false],
      ['shared-connector', true],
      ['same-block-receive', false],
      ['consolidation', false],
      ['deployer-link', false],
    ]);
    expect(cluster.signals[0].evidence.map((item: { blockNumber: number }) => item.blockNumber)).toEqual([50, 100, 110]);
    expect(cluster.signals[0].evidence[0]).toMatchObject({ transferKind: 'native', id: expect.stringMatching(/^native:\d+$/) });
    expect(cluster.caveats[0]).toContain('belum tentu pemilik yang sama');

    const again = await request(app.getHttpServer()).get(url(`/clusters?map=${firstMapId}`)).expect(200);
    expect(again.body.clustering.computedAt).toBe(body.clustering.computedAt);
    expect(again.body.clusters).toEqual(body.clusters);

    const map = await request(app.getHttpServer()).get(url(`?map=${firstMapId}`)).expect(200);
    expect(map.body.clusters).toEqual(body.clusters);
    const clusterOf = Object.fromEntries(map.body.nodes.map((node: NodeBody & { clusterId: string | null }) => [node.address, node.clusterId]));
    expect(clusterOf[H1]).toBe(cluster.id);
    expect(clusterOf[GRAND]).toBe(cluster.id);
    expect(clusterOf[POOL]).toBeNull();
  });

  it('label orang dalam hanya muncul bila deployer mengirim langsung ke anggota', async () => {
    const [tokenAddress] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, TOKEN));
    const [grand] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, GRAND));
    await db.update(schema.tokens).set({ deployerAddressId: grand.id }).where(eq(schema.tokens.addressId, tokenAddress.id));
    try {
      const { body } = await request(app.getHttpServer()).get(url('?holders=2')).expect(200);
      const [cluster] = body.clusters;
      expect(cluster).toMatchObject({ hasDirectEvidence: true, confidence: 'high' });
      expect(cluster.labels).toContain('insider_or_team');
      const link = cluster.signals.find((signal: { id: string }) => signal.id === 'deployer-link');
      expect(link).toMatchObject({ matched: true, evidence: [{ transferKind: 'native', blockNumber: 50 }] });
    } finally {
      await db.update(schema.tokens).set({ deployerAddressId: null }).where(eq(schema.tokens.addressId, tokenAddress.id));
    }
  });

  it('memberi label dugaan dari data peta dan menghitung jenis label untuk pilihan filter', async () => {
    const { body } = await request(app.getHttpServer()).get(url(`?map=${firstMapId}`)).expect(200);
    expect(body.labelCounts).toEqual([
      { type: 'whale', count: 2 },
      { type: 'liquidity_pool', count: 1 },
      { type: 'none', count: 3 },
    ]);
    const h1 = body.nodes.find((node: NodeBody) => node.address === H1);
    expect(h1.labels).toEqual([
      { type: 'whale', name: 'Whale (40% supply)', source: 'heuristic', sourceName: 'OpenChain heuristic', classification: 'heuristic', confidence: 0.6 },
    ]);
    expect(body.filter).toEqual({ hide: [], labelSource: 'all', from: null, to: null, kinds: null, hiddenNodes: 0, hiddenEdges: 0 });
  });

  it('menyaring wallet menurut label dan sumbernya, beserta garisnya', async () => {
    const noLabel = await request(app.getHttpServer()).get(url(`?map=${firstMapId}&hide=none`)).expect(200);
    expect(noLabel.body.nodes.map((node: NodeBody) => node.address)).toEqual([H1, H2, POOL]);
    expect(links(noLabel.body)).toEqual([['token_transfer', POOL, H1]]);
    expect(noLabel.body.filter).toMatchObject({ hide: ['none'], hiddenNodes: 3, hiddenEdges: 6 });
    expect(noLabel.body.labelCounts).toHaveLength(3);
    expect(noLabel.body.caveats.join(' ')).toContain('3 wallet disembunyikan filter label');

    const external = await request(app.getHttpServer()).get(url(`?map=${firstMapId}&labelSource=external`)).expect(200);
    expect(external.body.nodes.map((node: NodeBody) => node.address)).toEqual([POOL]);
    expect(external.body.edges).toEqual([]);
  });

  it('menyaring garis menurut jenis dan waktu; wallet yang tak lagi terhubung ikut keluar', async () => {
    const funding = await request(app.getHttpServer()).get(url(`?map=${firstMapId}&kinds=funding`)).expect(200);
    expect(funding.body.nodes.map((node: NodeBody) => node.address)).toEqual([H1, H2, POOL, FUNDER, GRAND]);
    expect(funding.body.edges.every((edge: EdgeBody) => edge.kind === 'funding')).toBe(true);
    expect(funding.body.filter.kinds).toEqual(['funding']);

    const from = at(105).toISOString();
    const recent = await request(app.getHttpServer()).get(url(`?map=${firstMapId}&from=${from}`)).expect(200);
    expect(recent.body.nodes.map((node: NodeBody) => node.address)).toEqual([H1, H2, POOL, FUNDER, CONNECTOR]);
    expect(links(recent.body)).toContainEqual(['funding', FUNDER, H2]);
    expect(links(recent.body)).not.toContainEqual(['funding', FUNDER, H1]);
    expect(recent.body.filter.from).toBe(from);
    expect(recent.body.caveats.join(' ')).toContain('rentang waktu');
  });

  it('menolak filter yang salah', async () => {
    const server = app.getHttpServer();
    const unknown = await request(server).get(url('?hide=exchange,kucing')).expect(400);
    expect(unknown.body.message).toContain('kucing');
    await request(server).get(url('?labelSource=semua')).expect(400);
    await request(server).get(url('?kinds=swap')).expect(400);
    await request(server).get(url('?from=2026-10-01')).expect(400);
    await request(server).get(url('?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z')).expect(400);
  });

  it('kelompok: peta yang belum ada atau bukan milik token dijawab 404', async () => {
    const server = app.getHttpServer();
    const none = await request(server).get(url('/clusters', BARE)).expect(404);
    expect(none.body.message).toContain('Belum ada peta');
    await request(server).get(url(`/clusters?map=${firstMapId}`, BARE)).expect(404);
    await request(server).get(url('/clusters?map=abc')).expect(400);
  });

  it('detail garis menolak id yang salah dan garis yang tidak ada di peta', async () => {
    const server = app.getHttpServer();
    await request(server).get(url('/edges/abc')).expect(400);
    await request(server).get(url('/edges/internal:1')).expect(400);
    await request(server).get(url('/edges/token:0')).expect(400);
    const missing = await request(server).get(url('/edges/token:999999')).expect(404);
    expect(missing.body.message).toContain('tidak ada di peta mana pun');
    await request(server).get(url(`/edges/token:999999?map=${firstMapId}`)).expect(404);
    await request(server).get(url(`/edges/token:1?map=${firstMapId}`, BARE)).expect(404);
    await request(server).get(url('/edges/token:1', TOKEN, 'mars')).expect(404);
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
  });

  it('empty state: token tanpa snapshot dijawab 200 dengan penjelasan, bukan 404', async () => {
    const { body } = await request(app.getHttpServer()).get(url('', BARE)).expect(200);
    expect(body).toMatchObject({
      token: { address: BARE },
      map: null,
      nodes: [],
      edges: [],
      clusters: [],
      clustering: null,
      coordination: [],
      snapshot: null,
      dataStatus: 'unavailable',
      emptyState: { reason: 'no_snapshot', scope: 'nodes', actions: ['ingest_token'] },
    });
    expect(body.emptyState.message).toContain('bukan berarti token aman');
  });

  it('empty state: snapshot tanpa holder, holder belum dipindai, dan holder tanpa hubungan dibedakan', async () => {
    const noHolders = await request(app.getHttpServer()).get(url('', NO_HOLDERS)).expect(200);
    expect(noHolders.body).toMatchObject({ nodes: [], map: { status: 'unavailable' }, emptyState: { reason: 'no_holders', scope: 'nodes' } });

    const unscanned = await request(app.getHttpServer()).get(url('', UNSCANNED)).expect(200);
    expect(unscanned.body.nodes).toHaveLength(2);
    expect(unscanned.body.emptyState).toMatchObject({ reason: 'no_history', scope: 'edges', actions: ['collect_holder_history'] });
    expect(unscanned.body.emptyState.message).toContain('BARU');

    const lonely = await request(app.getHttpServer()).get(url('', LONELY)).expect(200);
    expect(lonely.body.nodes).toHaveLength(2);
    expect(lonely.body.map.status).toBe('complete');
    expect(lonely.body.emptyState).toMatchObject({ reason: 'no_connections', scope: 'edges', actions: [] });
  });

  it('empty state: filter yang menyembunyikan semua wallet atau semua garis', async () => {
    const all = await request(app.getHttpServer()).get(url(`?map=${firstMapId}&hide=whale,liquidity_pool,none`)).expect(200);
    expect(all.body.nodes).toEqual([]);
    expect(all.body.emptyState).toMatchObject({ reason: 'filtered_out', scope: 'nodes', actions: ['reset_filter'] });

    const funding = await request(app.getHttpServer()).get(url(`?map=${firstMapId}&radius=0&kinds=funding`)).expect(200);
    expect(funding.body.nodes).toHaveLength(3);
    expect(funding.body.emptyState).toMatchObject({ reason: 'filtered_out', scope: 'edges', actions: ['reset_filter', 'widen_radius'] });

    const full = await request(app.getHttpServer()).get(url(`?map=${firstMapId}`)).expect(200);
    expect(full.body.emptyState).toBeNull();
  });
});
