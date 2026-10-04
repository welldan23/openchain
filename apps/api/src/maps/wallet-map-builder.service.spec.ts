import type { PGlite } from '@electric-sql/pglite';
import { asc, eq } from 'drizzle-orm';
import { createTestDatabase, insertEvmAddress, type TestDatabase } from '../../test/support/database.js';
import type { Clock } from '../common/clock.js';
import type { Database } from '../database/database.module.js';
import { InvalidIdentifierError, normalizeTxHash } from '../database/identifiers.js';
import * as schema from '../database/schema/index.js';
import { MapsRepository } from './maps.repository.js';
import { MapBuildError, WalletMapBuilder } from './wallet-map-builder.service.js';

const BUILT_AT = new Date('2026-10-04T03:00:00Z');
const FETCHED_AT = new Date('2026-10-04T00:00:00Z');
const clock: Clock = { now: () => BUILT_AT };
const addr = (seed: string) => '0x' + seed.repeat(20);

let client: PGlite;
let db: TestDatabase;
let builder: WalletMapBuilder;
let txSeq = 0;

const nextHash = () => normalizeTxHash('evm', '0x' + (++txSeq).toString(16).padStart(64, '0'));

async function nativeTransfer(fromId: number, toId: number, blockNumber: number, kind: 'transaction' | 'internal' = 'transaction') {
  const [row] = await db
    .insert(schema.nativeTransfers)
    .values({
      chainId: 'robinhood',
      txHash: nextHash(),
      kind,
      tracePath: kind === 'internal' ? '0' : '',
      fromAddressId: fromId,
      toAddressId: toId,
      amountRaw: '1000000000000000000',
      blockNumber,
      blockTimestamp: FETCHED_AT,
      fetchedAt: FETCHED_AT,
    })
    .returning();
  return row;
}

async function tokenTransfer(tokenId: number, fromId: number, toId: number, blockNumber: number) {
  const [row] = await db
    .insert(schema.tokenTransfers)
    .values({
      chainId: 'robinhood',
      txHash: nextHash(),
      logIndex: 0,
      tokenId,
      fromAddressId: fromId,
      toAddressId: toId,
      amountRaw: '500',
      blockNumber,
      blockTimestamp: FETCHED_AT,
      fetchedAt: FETCHED_AT,
    })
    .returning();
  return row;
}

async function scan(addressId: number, blockFrom: number, blockTo: number) {
  await db.insert(schema.addressFlowScans).values({
    chainId: 'robinhood',
    addressId,
    blockFrom,
    blockTo,
    windowFrom: FETCHED_AT,
    windowTo: FETCHED_AT,
    nativeScanned: true,
    tokensScanned: true,
    internalScanned: true,
    status: blockFrom === 0 ? 'complete' : 'partial',
    statusReason: blockFrom === 0 ? null : 'Riwayat dibatasi jumlah halaman.',
    scannedAt: FETCHED_AT,
  });
}

/**
 * Token dengan holder H1, H2, dan pool. F mendanai H1 dan H2, G mendanai F;
 * C menerima token dari H1 lalu meneruskan ke H2. Sebagian data sengaja di
 * luar blok peta (1000) supaya terbukti tidak ikut.
 */
async function seed() {
  const tokenAddress = await insertEvmAddress(db, 'robinhood', addr('7a'));
  const [token] = await db.insert(schema.tokens).values({ chainId: 'robinhood', addressId: tokenAddress.id, standard: 'erc20', symbol: 'NBLA' }).returning();
  const [h1, h2, pool, f, g, c, late, zero] = await Promise.all(
    ['a1', 'a2', 'b0', 'f1', 'f2', 'c1', 'd1', '00'].map((seedValue) => insertEvmAddress(db, 'robinhood', addr(seedValue))),
  );
  await db.update(schema.addresses).set({ isContract: true }).where(eq(schema.addresses.id, pool.id));
  await db.insert(schema.labels).values({
    addressId: pool.id,
    labelType: 'liquidity_pool',
    name: 'Pool NBLA/WETH',
    source: 'external',
    sourceName: 'Blockscout',
    classification: 'external_label',
  });
  const [older] = await db.insert(schema.tokenSnapshots).values({ tokenId: token.id, blockNumber: 400, fetchedAt: FETCHED_AT, dataStatus: 'complete' }).returning();
  const [snapshot] = await db.insert(schema.tokenSnapshots).values({ tokenId: token.id, blockNumber: 1000, fetchedAt: FETCHED_AT, dataStatus: 'complete' }).returning();
  await db.insert(schema.holders).values([
    { snapshotId: snapshot.id, addressId: pool.id, rank: 1, balanceRaw: '400', sharePct: '40.000000' },
    { snapshotId: snapshot.id, addressId: h1.id, rank: 2, balanceRaw: '300', sharePct: '30.000000' },
    { snapshotId: snapshot.id, addressId: h2.id, rank: 3, balanceRaw: '200', sharePct: '20.000000' },
    { snapshotId: older.id, addressId: h1.id, rank: 1, balanceRaw: '100', sharePct: '100.000000' },
  ]);

  const fundH1 = await nativeTransfer(f.id, h1.id, 100);
  const fundH2 = await nativeTransfer(f.id, h2.id, 110);
  const fundF = await nativeTransfer(g.id, f.id, 50, 'internal');
  await nativeTransfer(late.id, f.id, 2000);
  const buy = await tokenTransfer(token.id, pool.id, h1.id, 500);
  const h1ToH2 = await tokenTransfer(token.id, h1.id, h2.id, 600);
  const h1ToC = await tokenTransfer(token.id, h1.id, c.id, 700);
  const cToH2 = await tokenTransfer(token.id, c.id, h2.id, 710);
  await tokenTransfer(token.id, h2.id, h1.id, 1500);
  await tokenTransfer(token.id, zero.id, h1.id, 10);
  await tokenTransfer(token.id, zero.id, h2.id, 10);

  await scan(h1.id, 0, 1200);
  await scan(h2.id, 0, 1200);
  await scan(f.id, 40, 1200);
  return { token, snapshot, older, h1, h2, pool, f, g, c, transfers: { fundH1, fundH2, fundF, buy, h1ToH2, h1ToC, cToH2 } };
}

let seeded: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  ({ client, db } = await createTestDatabase());
  const database = db as unknown as Database;
  builder = new WalletMapBuilder(database, new MapsRepository(database), clock);
  seeded = await seed();
}, 60_000);

afterAll(async () => {
  await client.close();
});

describe('WalletMapBuilder', () => {
  it('membentuk peta dari snapshot terbaru dan menyimpan node serta garis dengan bukti transfernya', async () => {
    const { token, snapshot, h1, h2, pool, f, g, c, transfers } = seeded;
    const result = await builder.build({ chainId: 'robinhood', tokenAddress: addr('7A'), fundingDepth: 2 });

    expect(result).toMatchObject({ tokenId: token.id, snapshotId: snapshot.id, blockNumber: 1000, holderLimit: 50, fundingDepth: 2, builtAt: BUILT_AT });
    expect(result.graph.status).toBe('partial');
    expect(result.graph.missingFields).toEqual(['funder_history']);
    expect(result.graph.coverage).toEqual({ holders: { full: 2, partial: 0, none: 0 }, fundersIncomplete: 1, notTraversed: 1 });

    const [map] = await db.select().from(schema.walletMaps).where(eq(schema.walletMaps.id, result.mapId));
    expect(map).toMatchObject({ status: 'partial', blockNumber: 1000, snapshotId: snapshot.id, missingFields: ['funder_history'], builtAt: BUILT_AT });
    expect(map.statusReason).toContain('Riwayat 1 wallet pendana belum lengkap');

    const nodes = await db.select().from(schema.mapNodes).where(eq(schema.mapNodes.mapId, result.mapId)).orderBy(asc(schema.mapNodes.id));
    const byAddress = new Map(nodes.map((node) => [node.addressId, node]));
    expect(nodes.map((node) => [node.addressId, node.role, node.sharePct])).toEqual([
      [pool.id, 'holder', '40.000000'],
      [h1.id, 'holder', '30.000000'],
      [h2.id, 'holder', '20.000000'],
      [f.id, 'funder', '0.000000'],
      [g.id, 'funder', '0.000000'],
      [c.id, 'connector', '0.000000'],
    ]);
    expect(byAddress.get(pool.id)?.isContract).toBe(true);

    const edges = await db.select().from(schema.mapEdges).where(eq(schema.mapEdges.mapId, result.mapId)).orderBy(asc(schema.mapEdges.id));
    const nodeAddress = new Map(nodes.map((node) => [node.id, node.addressId]));
    expect(
      edges.map((edge) => [edge.kind, nodeAddress.get(edge.fromNodeId), nodeAddress.get(edge.toNodeId), edge.nativeTransferId ?? edge.tokenTransferId]),
    ).toEqual([
      ['funding', f.id, h1.id, transfers.fundH1.id],
      ['funding', f.id, h2.id, transfers.fundH2.id],
      ['funding', g.id, f.id, transfers.fundF.id],
      ['token_transfer', pool.id, h1.id, transfers.buy.id],
      ['token_transfer', h1.id, h2.id, transfers.h1ToH2.id],
      ['token_transfer', h1.id, c.id, transfers.h1ToC.id],
      ['token_transfer', c.id, h2.id, transfers.cToH2.id],
    ]);
  });

  it('memakai snapshot pada blok yang diminta dan menolak blok yang tidak ada', async () => {
    const { older, h1 } = seeded;
    const result = await builder.build({ chainId: 'robinhood', tokenAddress: addr('7a'), snapshotBlock: 400, fundingDepth: 1 });
    expect(result.snapshotId).toBe(older.id);
    // Hanya transfer sampai blok 400: pendanaan H1 di blok 100 ikut, transfer token sesudahnya tidak.
    expect(result.graph.nodes.map((node) => node.addressId)).toEqual([h1.id, seeded.f.id]);
    expect(result.graph.edges).toEqual([
      { kind: 'funding', fromId: seeded.f.id, toId: h1.id, nativeTransferId: seeded.transfers.fundH1.id, tokenTransferId: null },
    ]);
    expect(result.graph.status).toBe('complete');

    await expect(builder.build({ chainId: 'robinhood', tokenAddress: addr('7a'), snapshotBlock: 999 })).rejects.toMatchObject({
      code: 'snapshot_not_found',
    });
  });

  it('menolak chain, token, address, dan parameter yang tidak valid tanpa menyimpan apa pun', async () => {
    const before = (await db.select().from(schema.walletMaps)).length;
    await expect(builder.build({ chainId: 'mars', tokenAddress: addr('7a') })).rejects.toMatchObject({ code: 'chain_not_found' });
    await expect(builder.build({ chainId: 'robinhood', tokenAddress: addr('7b') })).rejects.toMatchObject({ code: 'token_not_found' });
    await expect(builder.build({ chainId: 'robinhood', tokenAddress: 'bukan-address' })).rejects.toBeInstanceOf(InvalidIdentifierError);
    await expect(builder.build({ chainId: 'robinhood', tokenAddress: addr('7a'), holderLimit: 0 })).rejects.toBeInstanceOf(MapBuildError);
    await expect(builder.build({ chainId: 'robinhood', tokenAddress: addr('7a'), fundingDepth: 6 })).rejects.toMatchObject({ code: 'invalid_option' });
    expect(await db.select().from(schema.walletMaps)).toHaveLength(before);
  });

  it('snapshot tanpa holder disimpan sebagai peta tidak tersedia beserta alasannya', async () => {
    const tokenAddress = await insertEvmAddress(db, 'robinhood', addr('7c'));
    const [token] = await db.insert(schema.tokens).values({ chainId: 'robinhood', addressId: tokenAddress.id, standard: 'erc20' }).returning();
    await db.insert(schema.tokenSnapshots).values({ tokenId: token.id, blockNumber: 900, fetchedAt: FETCHED_AT, dataStatus: 'partial' });
    const result = await builder.build({ chainId: 'robinhood', tokenAddress: addr('7c') });
    const [map] = await db.select().from(schema.walletMaps).where(eq(schema.walletMaps.id, result.mapId));
    expect(map).toMatchObject({ status: 'unavailable', missingFields: ['holders'] });
    expect(map.statusReason).toContain('tidak punya data holder');
    expect(await db.select().from(schema.mapNodes).where(eq(schema.mapNodes.mapId, result.mapId))).toEqual([]);
  });
});
