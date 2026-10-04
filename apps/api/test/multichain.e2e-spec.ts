import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
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

const SUBJECT = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const LOWER = SUBJECT.toLowerCase();
const FUNDER = '0x' + '11'.repeat(20);
const SHOP = '0x' + '22'.repeat(20);
const BRIDGE = '0x' + 'b7'.repeat(20);
const RELAYER = '0x' + 'e1'.repeat(20);
const OTHER = '0x' + '33'.repeat(20);
const TOKEN = '0x' + '70'.repeat(20);
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
  amountRaw: '1000000000000000000',
  blockNumber: block,
  timestamp: at(block),
});
const token = (from: string, to: string, block: number): IndexedTokenTransfer => ({
  txHash: hash(),
  logIndex: 0,
  token: { address: TOKEN, symbol: 'NBLA', name: 'Nebula', decimals: 18 },
  from,
  to,
  amountRaw: '5000000000000000000',
  blockNumber: block,
  timestamp: at(block),
});
const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };
function scanOf(chainId: string, address: string, nativeTransfers: IndexedNativeTransfer[], tokenTransfers: IndexedTokenTransfer[] = [], fetchedAt = SCANNED_AT): AddressFlowCollection {
  return {
    chainId,
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

interface ChainBody {
  chain: { id: string };
  status: string;
  known: boolean;
  statusReason: string | null;
}

describe('GET /api/multichain/:address', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let ingestion: FundFlowIngestionService;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    ingestion = new FundFlowIngestionService(db as unknown as Database);
    // Ethereum: modal dari pendana, kirim token ke toko, lalu menerima dana bridge dari relayer.
    await ingestion.persist(scanOf('ethereum', SUBJECT, [native(FUNDER, SUBJECT, 100), native(RELAYER, SUBJECT, 400)], [token(SUBJECT, SHOP, 200)]), 'evm');
    // Base: kirim ke kontrak bridge.
    await ingestion.persist(scanOf('base', SUBJECT, [native(SUBJECT, BRIDGE, 300)]), 'evm');
    // Optimism: hanya muncul sebagai penerima di riwayat address lain.
    await ingestion.persist(scanOf('optimism', OTHER, [native(OTHER, SUBJECT, 50)]), 'evm');

    const find = async (chainId: string, raw: string) =>
      (await db.select().from(schema.addresses).where(and(eq(schema.addresses.chainId, chainId), eq(schema.addresses.addressNormalized, raw.toLowerCase()))))[0];
    const bridge = await find('base', BRIDGE);
    await db.insert(schema.labels).values({ addressId: bridge.id, labelType: 'bridge', name: 'Contoh Bridge', source: 'external', sourceName: 'Blockscout', classification: 'external_label' });
    const [sent] = await db.select().from(schema.nativeTransfers).where(eq(schema.nativeTransfers.toAddressId, bridge.id));
    const ethSubject = await find('ethereum', SUBJECT);
    const relayer = await find('ethereum', RELAYER);
    const [received] = await db.select().from(schema.nativeTransfers).where(eq(schema.nativeTransfers.fromAddressId, relayer.id));
    await db.insert(schema.bridgeTransfers).values({
      sourceChainId: 'base',
      destChainId: 'ethereum',
      bridgeAddressId: bridge.id,
      senderAddressId: sent.fromAddressId,
      recipientAddressId: ethSubject.id,
      sentNativeTransferId: sent.id,
      receivedNativeTransferId: received.id,
      amountSentRaw: '1000000000000000000',
      amountReceivedRaw: '1000000000000000000',
      status: 'matched',
      matchHeuristic: 'bridge-amount-time-v1',
      matchConfidence: 'medium',
      matchReason: 'Jumlah sama, diterima 100 menit kemudian',
      sentAt: at(300),
      receivedAt: at(400),
      updatedAt: SCANNED_AT,
    });

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

  const url = (query = '', address = SUBJECT) => `/api/multichain/${address}${query}`;
  let firstScanId: number;

  it('meringkas tiap chain EVM; chain yang belum dipindai tetap tampil dengan alasannya', async () => {
    const { body } = await request(app.getHttpServer()).get(url()).expect(200);
    firstScanId = body.scan.id;
    expect(body).toMatchObject({ address: SUBJECT, family: 'evm', scan: { reused: false }, status: 'partial' });
    expect(body.chains.map((item: ChainBody) => [item.chain.id, item.status, item.known])).toEqual([
      ['robinhood', 'unavailable', false],
      ['ethereum', 'complete', true],
      ['base', 'complete', true],
      ['bsc', 'unavailable', false],
      ['arbitrum', 'unavailable', false],
      ['optimism', 'unavailable', true],
      ['polygon', 'unavailable', false],
      ['hyperevm', 'unavailable', false],
    ]);
    const ethereum = body.chains[1];
    expect(ethereum).toMatchObject({
      txCount: 3,
      inCount: 2,
      outCount: 1,
      counterpartyCount: 3,
      inUsd: null,
      outUsd: null,
      unpricedCount: 3,
      nativeBalanceRaw: null,
      balanceUsd: null,
      snapshotBlock: 1000,
      firstSeen: at(100).toISOString(),
      lastSeen: at(400).toISOString(),
    });
    expect(body.chains[0]).toMatchObject({ txCount: null, counterpartyCount: null, statusReason: expect.stringContaining('belum pernah dipindai') });
    expect(body.chains[5].statusReason).toContain('lawan transaksi');
    expect(body.statusReason).toContain('6 dari 8 chain');
    expect(body.window).toEqual({ from: at(0).toISOString(), to: SCANNED_AT.toISOString() });
    expect(body.caveats.join(' ')).toContain('bukan berarti tidak ada aktivitas');
  });

  it('linimasa gabungan semua chain, dengan kiriman ke bridge dan pasangan bridge-nya', async () => {
    const { body } = await request(app.getHttpServer()).get(url()).expect(200);
    expect(body.activities.map((item: { chain: string; kind: string; blockNumber: number }) => [item.chain, item.kind, item.blockNumber])).toEqual([
      ['ethereum', 'in', 400],
      ['base', 'bridge_out', 300],
      ['ethereum', 'out', 200],
      ['ethereum', 'in', 100],
    ]);
    const bridgeId = body.bridges[0].id;
    expect(body.activities[0].bridgeId).toBe(bridgeId);
    expect(body.activities[1]).toMatchObject({ bridgeId, counterparty: BRIDGE, counterpartyLabels: [expect.objectContaining({ type: 'bridge' })], amount: '1' });
    expect(body.activities[2]).toMatchObject({ transferKind: 'token', asset: { type: 'token', symbol: 'NBLA' }, amount: '5', classification: 'verified_fact' });
    expect(body.bridges).toEqual([
      expect.objectContaining({
        fromChain: 'base',
        toChain: 'ethereum',
        bridgeAddress: BRIDGE,
        status: 'matched',
        matchClassification: 'heuristic',
        matchConfidence: 'medium',
        sentTxHash: body.activities[1].txHash,
        receivedTxHash: body.activities[0].txHash,
      }),
    ]);
    expect(body.activityPage).toEqual({ limit: 100, truncated: false });
  });

  it('memakai ulang ringkasan tersimpan dan membukanya lagi lewat ?scan=', async () => {
    const again = await request(app.getHttpServer()).get(url()).expect(200);
    expect(again.body.scan).toMatchObject({ id: firstScanId, reused: true });
    const byId = await request(app.getHttpServer()).get(url(`?scan=${firstScanId}`, LOWER)).expect(200);
    expect(byId.body.scan).toMatchObject({ id: firstScanId, reused: true });
    expect(byId.body.chains).toEqual(again.body.chains);
    await request(app.getHttpServer()).get(url('?scan=99999')).expect(404);
  });

  it('menyaring chain dan waktu tanpa menyimpan ringkasan, dan membatasi linimasa', async () => {
    const onlyEth = await request(app.getHttpServer()).get(url('?chains=ethereum')).expect(200);
    expect(onlyEth.body.scan).toBeNull();
    expect(onlyEth.body.chains.map((item: ChainBody) => item.chain.id)).toEqual(['ethereum']);
    expect(onlyEth.body.status).toBe('complete');

    const recent = await request(app.getHttpServer()).get(url(`?from=${at(250).toISOString()}`)).expect(200);
    expect(recent.body.activities.map((item: { blockNumber: number }) => item.blockNumber)).toEqual([400, 300]);
    expect(recent.body.chains[1].txCount).toBe(1);
    expect(recent.body.window.from).toBe(at(250).toISOString());

    const limited = await request(app.getHttpServer()).get(url('?limit=2')).expect(200);
    expect(limited.body.activities).toHaveLength(2);
    expect(limited.body.activityPage).toEqual({ limit: 2, truncated: true });
    expect(limited.body.caveats.join(' ')).toContain('dibatasi 2 transfer');
  });

  it('pemindaian aliran dana baru membuat ringkasan baru', async () => {
    await ingestion.persist(scanOf('arbitrum', SUBJECT, [], [], new Date(NOW.getTime() - 60_000)), 'evm');
    const { body } = await request(app.getHttpServer()).get(url()).expect(200);
    expect(body.scan.reused).toBe(false);
    expect(body.scan.id).not.toBe(firstScanId);
    expect(body.chains.find((item: ChainBody) => item.chain.id === 'arbitrum')).toMatchObject({ status: 'complete', txCount: 0, counterpartyCount: 0 });
  });

  it('menolak masukan yang salah', async () => {
    const server = app.getHttpServer();
    const solana = await request(server).get(url('', 'So11111111111111111111111111111111111111112')).expect(400);
    expect(solana.body.message).toContain('address EVM');
    await request(server).get(url('?chains=solana')).expect(400);
    await request(server).get(url('?chains=mars')).expect(400);
    await request(server).get(url('?limit=0')).expect(400);
    await request(server).get(url('?limit=501')).expect(400);
    await request(server).get(url('?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z')).expect(400);
    await request(server).get(url('?from=kemarin')).expect(400);
  });
});
