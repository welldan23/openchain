import type { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import { RISK_METHODOLOGY } from '../src/risk/risk-rules.js';
import { RiskScoringError, RiskScoringService } from '../src/risk/risk-scoring.service.js';
import { RiskRepository } from '../src/risk/risk.repository.js';
import { createTestDatabase, seedContractChecks, seedToken, testTxHash, type TestDatabase } from './support/database.js';

const TOKEN = '0x' + 'ab'.repeat(20);
const WALLET = '0x' + 'c1'.repeat(20);
const EXCHANGE = '0x' + 'e1'.repeat(20);
const BRIDGE = '0x' + 'b1'.repeat(20);
const POOL = '0x' + 'f0'.repeat(20);
const SCANNED_AT = new Date('2026-10-03T04:00:00Z');
const NOW = new Date('2026-10-03T05:00:00Z');
const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };

function scan(chainId: string, address: string, transfers: AddressFlowCollection['nativeTransfers']): AddressFlowCollection {
  return {
    chainId,
    address,
    fetchedAt: SCANNED_AT,
    runs: [],
    head: { blockNumber: 1_000, timestamp: SCANNED_AT },
    nativeTransfers: transfers,
    tokenTransfers: [],
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 1_000,
      windowFrom: new Date('2026-09-01T00:00:00Z'),
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

describe('skoring risiko objek multichain', () => {
  let client: PGlite;
  let db: TestDatabase;
  let service: RiskScoringService;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const { snapshots } = await seedToken(db, { address: TOKEN });
    await seedContractChecks(db, 'robinhood', snapshots[1].id);

    const ingestion = new FundFlowIngestionService(db as unknown as Database);
    const depositTx = testTxHash('setoran-exchange');
    const bridgeTx = testTxHash('kirim-bridge');
    await ingestion.persist(
      scan('ethereum', WALLET, [
        { txHash: depositTx, kind: 'transaction', tracePath: '', from: WALLET, to: EXCHANGE, amountRaw: '3', blockNumber: 900, timestamp: new Date('2026-10-01T00:00:00Z') },
        { txHash: bridgeTx, kind: 'transaction', tracePath: '', from: WALLET, to: BRIDGE, amountRaw: '2', blockNumber: 500, timestamp: new Date('2026-09-10T00:00:00Z') },
      ]),
      'evm',
    );
    // Wallet yang sama juga tercatat di Base, tapi belum pernah dipindai di sana.
    await db.insert(schema.addresses).values({ chainId: 'base', address: WALLET, addressNormalized: WALLET });
    // Pool berlabel di Ethereum: kontrak selain token.
    await ingestion.persist(scan('ethereum', POOL, []), 'evm');

    const address = async (chainId: string, raw: string) =>
      (await db.select().from(schema.addresses).where(and(eq(schema.addresses.chainId, chainId), eq(schema.addresses.addressNormalized, raw))))[0];
    const [wallet, exchange, bridge, pool] = await Promise.all([address('ethereum', WALLET), address('ethereum', EXCHANGE), address('ethereum', BRIDGE), address('ethereum', POOL)]);
    const [exchangeLabel] = await db
      .insert(schema.labels)
      .values({ addressId: exchange.id, labelType: 'exchange', name: 'Bybit', source: 'external', sourceName: 'Blockscout', classification: 'external_label' })
      .returning();
    await db.insert(schema.labels).values([
      { addressId: pool.id, labelType: 'liquidity_pool', name: 'Uniswap V2', source: 'external', sourceName: 'Blockscout', classification: 'external_label' },
      { addressId: wallet.id, labelType: 'bot', name: 'Bot sniper', source: 'heuristic', sourceName: 'OpenChain heuristic', classification: 'heuristic', confidence: '0.600' },
    ]);
    const transfers = await db.select().from(schema.nativeTransfers).where(eq(schema.nativeTransfers.fromAddressId, wallet.id));
    const deposit = transfers.find((row) => row.txHash === depositTx)!;
    const sent = transfers.find((row) => row.txHash === bridgeTx)!;
    // Ingestion sudah mencatatnya sebagai transfer biasa; label exchange baru diketahui sekarang.
    await db
      .update(schema.movementClassifications)
      .set({ movementType: 'exchange_deposit', classification: 'external_label', basis: 'Penerima berlabel exchange (Blockscout)', labelId: exchangeLabel.id, classifiedAt: NOW })
      .where(eq(schema.movementClassifications.nativeTransferId, deposit.id));
    await db.insert(schema.bridgeTransfers).values({
      sourceChainId: 'ethereum',
      bridgeAddressId: bridge.id,
      senderAddressId: wallet.id,
      sentNativeTransferId: sent.id,
      amountSentRaw: '2',
      status: 'pending',
      sentAt: sent.blockTimestamp,
      updatedAt: NOW,
    });

    service = new RiskScoringService(new RiskRepository(db as unknown as Database), { now: () => NOW });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('token: skor dari cek kontrak dan konsentrasi holder, dengan bukti hash dan ciri yang belum bisa dicek', async () => {
    const [result] = await service.assessAddress(TOKEN, 'robinhood');
    if (result.status !== 'assessed') throw new Error(result.reason);
    // tax fail 20 + ownership warn 5 + top10 61,8% 8.
    expect(result).toMatchObject({ objectKind: 'token', blockNumber: 23512880, dataStatus: 'partial' });
    expect(result.draft).toMatchObject({ score: 33, level: 'medium' });
    expect(result.statusReason).toContain('blockscout: data belum lengkap (holders.labels)');

    const [stored] = await db.select().from(schema.riskAssessments).where(eq(schema.riskAssessments.id, result.assessmentId));
    expect(stored).toMatchObject({ methodology: RISK_METHODOLOGY, score: 33, level: 'medium', objectKind: 'token', tokenSnapshotId: expect.any(Number) });
    const reasons = await db.select().from(schema.riskReasons).where(eq(schema.riskReasons.assessmentId, stored.id)).orderBy(schema.riskReasons.position);
    expect(reasons.map((row) => [row.code, row.points, row.classification])).toEqual([
      ['check_tax', 20, 'verified_fact'],
      ['holder_concentration', 8, 'derived_metric'],
      ['check_ownership', 5, 'verified_fact'],
    ]);
    const evidence = await db.select().from(schema.riskReasonEvidence).where(eq(schema.riskReasonEvidence.reasonId, reasons[0].id));
    expect(evidence).toEqual([expect.objectContaining({ chainId: 'robinhood', txHash: testTxHash(`tax-${stored.tokenSnapshotId}`), evidenceId: expect.any(Number) })]);
    const traits = await db.select().from(schema.riskTraitChecks).where(eq(schema.riskTraitChecks.assessmentId, stored.id));
    const byTrait = new Map(traits.map((row) => [row.trait, row]));
    expect(byTrait.get('tax_change')).toMatchObject({ status: 'detected', reasonId: reasons[0].id });
    expect(byTrait.get('sell_blocked')).toMatchObject({ status: 'unknown', note: 'Belum bisa diperiksa: Belum disimulasikan.' });
    expect(byTrait.get('mint_active')?.status).toBe('clear');
    expect(byTrait.get('bundled_launch')?.status).toBe('unknown');
    expect(await db.select().from(schema.riskAssessmentSources).where(eq(schema.riskAssessmentSources.assessmentId, stored.id))).toHaveLength(2);
  });

  it('wallet multichain: dinilai di chain yang sudah dipindai, chain lain dilaporkan tanpa data', async () => {
    const results = await service.assessAddress(WALLET.toUpperCase().replace('0X', '0x'));
    expect(results.map((item) => [item.chainId, item.status])).toEqual([
      ['base', 'no_data'],
      ['ethereum', 'assessed'],
    ]);
    expect(results[0]).toMatchObject({ objectKind: 'wallet', reason: 'Riwayat address ini belum dipindai di chain ini.' });
    const ethereum = results[1];
    if (ethereum.status !== 'assessed') throw new Error('harus dinilai');
    expect(ethereum).toMatchObject({ blockNumber: 1_000, dataStatus: 'complete', statusReason: null });
    // Setoran exchange 5 + bridge 5 + label bot 5.
    expect(ethereum.draft.score).toBe(15);
    expect(ethereum.draft.reasons.map((reason) => reason.code).sort()).toEqual(['bot_label', 'bridge_hop', 'exchange_cashout']);
    // Setoran 2 hari sebelum pemindaian jadi peringatan dini; bridge 3 minggu lalu tidak.
    expect(ethereum.draft.warnings.map((warning) => warning.code)).toEqual(['recent_exchange_cashout']);
    const warnings = await db.select().from(schema.riskWarnings).where(eq(schema.riskWarnings.assessmentId, ethereum.assessmentId));
    const warningEvidence = await db.select().from(schema.riskWarningEvidence).where(eq(schema.riskWarningEvidence.warningId, warnings[0].id));
    expect(warningEvidence.map((row) => row.txHash)).toEqual([testTxHash('setoran-exchange')]);
  });

  it('kontrak selain token: tersimpan tanpa skor dengan alasan; menilai ulang mengganti penilaian yang sama', async () => {
    const [first] = await service.assessAddress(POOL, 'ethereum');
    if (first.status !== 'assessed') throw new Error('harus dinilai');
    expect(first).toMatchObject({ objectKind: 'contract', dataStatus: 'partial' });
    expect(first.draft).toMatchObject({ score: null, level: 'unknown' });
    expect(first.statusReason).toContain('kontrak selain token');
    const [second] = await service.assessAddress(POOL, 'ethereum');
    const rows = await db.select().from(schema.riskAssessments).where(eq(schema.riskAssessments.objectKind, 'contract'));
    expect(rows).toHaveLength(1);
    expect(second.status === 'assessed' && second.assessmentId).toBe(rows[0].id);
  });

  it('galat yang jelas untuk chain tak dikenal, address rusak, dan address yang belum tercatat', async () => {
    await expect(service.assessAddress(WALLET, 'mars')).rejects.toMatchObject({ code: 'chain_not_found' });
    await expect(service.assessAddress('0x1234', 'ethereum')).rejects.toBeInstanceOf(RiskScoringError);
    await expect(service.assessAddress('0x' + '99'.repeat(20))).rejects.toMatchObject({ code: 'address_not_found' });
  });
});
