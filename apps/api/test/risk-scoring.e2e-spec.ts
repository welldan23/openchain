import type { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import { RISK_METHODOLOGY } from '../src/risk/risk-rules.js';
import { FlowsRepository } from '../src/flows/flows.repository.js';
import { TransactionEvidenceService } from '../src/flows/transaction-evidence.service.js';
import { RiskFindingDetailService } from '../src/risk/risk-finding-detail.service.js';
import { RiskFindingsService } from '../src/risk/risk-findings.service.js';
import { RiskScoringError, RiskScoringService } from '../src/risk/risk-scoring.service.js';
import { RiskSummaryService } from '../src/risk/risk-summary.service.js';
import { RiskWarningService } from '../src/risk/risk-warning.service.js';
import { RiskRepository } from '../src/risk/risk.repository.js';
import { createTestDatabase, seedContractChecks, seedToken, testTxHash, type TestDatabase } from './support/database.js';

const TOKEN = '0x' + 'ab'.repeat(20);
const WALLET = '0x' + 'c1'.repeat(20);
const EXCHANGE = '0x' + 'e1'.repeat(20);
const BRIDGE = '0x' + 'b1'.repeat(20);
const POOL = '0x' + 'f0'.repeat(20);
const FRESH = '0x' + 'a7'.repeat(20);
const UNSCANNED = '0x' + 'a8'.repeat(20);
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
  let ingestion: FundFlowIngestionService;
  let tokenId: number;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const { snapshots } = await seedToken(db, { address: TOKEN });
    tokenId = snapshots[1].tokenId;
    await seedContractChecks(db, 'robinhood', snapshots[1].id);

    ingestion = new FundFlowIngestionService(db as unknown as Database);
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

    const repository = new RiskRepository(db as unknown as Database);
    service = new RiskScoringService(repository, new RiskWarningService(repository), { now: () => NOW });
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

  it('rincian peringatan dini: isi transaksi bukti dengan label exchange penerimanya', async () => {
    const repository = new RiskRepository(db as unknown as Database);
    const flows = new FlowsRepository(db as unknown as Database);
    const findings = new RiskFindingsService(new RiskSummaryService(repository, service, flows), repository);
    const detail = new RiskFindingDetailService(findings, repository, flows, new TransactionEvidenceService(flows));

    const warning = await detail.detail('ethereum', WALLET, 'warning', 'recent_exchange_cashout');
    expect(warning).toMatchObject({
      objectKind: 'wallet',
      score: 15,
      finding: { kind: 'warning', trait: 'exchange_cashout', points: null },
      shareOfCountedPoints: null,
      // Setoran baru: ciri ditautkan ke peringatannya, bukan ke alasan berpoinnya.
      traits: [{ trait: 'exchange_cashout', status: 'detected', finding: { kind: 'warning', id: 'recent_exchange_cashout' } }],
      countedPoints: 15,
      evidence: [{ chain: 'ethereum', txHash: testTxHash('setoran-exchange'), stored: true, record: null }],
    });
    const [movement] = warning.evidence[0].transaction!.movements;
    expect(movement).toMatchObject({ from: { address: WALLET }, to: { address: EXCHANGE, labels: [expect.objectContaining({ type: 'exchange', name: 'Bybit' })] }, amountRaw: '3' });
    expect(warning.caveats).toContain('Peringatan dini tidak menambah skor; ini pola baru yang perlu dipantau.');

    const reason = await detail.detail('ethereum', WALLET, 'reason', 'exchange_cashout');
    expect(reason).toMatchObject({ finding: { points: 5 }, shareOfCountedPoints: 33.3, traits: [] });
    await expect(detail.detail('ethereum', WALLET, 'reason', 'recent_exchange_cashout')).rejects.toThrow('tidak ada di penilaian terbaru');
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

  it('peringatan dini token: snapshot baru dibandingkan snapshot sebelumnya, tersimpan dan ditautkan ke ciri', async () => {
    const [snapshot] = await db
      .insert(schema.tokenSnapshots)
      .values({ tokenId, blockNumber: 23_513_000, fetchedAt: NOW, dataStatus: 'complete', liquidityUsd: '100000', priceUsd: '0.004', top10Pct: '75' })
      .returning();
    const { checks } = await seedContractChecks(db, 'robinhood', snapshot.id);
    await db.update(schema.contractChecks).set({ value: 'Beli 2% · Jual 25%, bisa diubah owner' }).where(eq(schema.contractChecks.id, checks.find((row) => row.code === 'tax')!.id));
    await db.update(schema.contractChecks).set({ status: 'fail', value: 'Owner bisa mencetak supply' }).where(eq(schema.contractChecks.id, checks.find((row) => row.code === 'mint')!.id));

    const [result] = await service.assessAddress(TOKEN, 'robinhood');
    if (result.status !== 'assessed') throw new Error(result.reason);
    expect(result.draft.warnings.map((warning) => [warning.code, warning.trait, warning.severity, warning.classification])).toEqual([
      ['changed_tax', 'tax_change', 'high', 'verified_fact'],
      ['liquidity_drop', 'liquidity_pulled', 'high', 'derived_metric'],
      ['worsened_mint', 'mint_active', 'high', 'verified_fact'],
      ['concentration_rising', 'holder_concentration', 'medium', 'derived_metric'],
    ]);
    expect(result.draft.warnings[1].description).toContain('$612,400 ke $100,000');
    // Peringatan tidak menambah skor: tax fail 20 + mint fail 20 + ownership 5 + top10 75% 8.
    expect(result.draft.score).toBe(53);

    const warnings = await db.select().from(schema.riskWarnings).where(eq(schema.riskWarnings.assessmentId, result.assessmentId));
    const taxWarning = warnings.find((row) => row.code === 'changed_tax')!;
    expect(await db.select().from(schema.riskWarningEvidence).where(eq(schema.riskWarningEvidence.warningId, taxWarning.id))).toEqual([
      expect.objectContaining({ txHash: testTxHash(`tax-${snapshot.id}`), evidenceId: expect.any(Number) }),
    ]);
    const traits = new Map((await db.select().from(schema.riskTraitChecks).where(eq(schema.riskTraitChecks.assessmentId, result.assessmentId))).map((row) => [row.trait, row]));
    expect(traits.get('tax_change')).toMatchObject({ status: 'detected', warningId: taxWarning.id, reasonId: null });
    expect(traits.get('liquidity_pulled')).toMatchObject({ status: 'detected', warningId: warnings.find((row) => row.code === 'liquidity_drop')!.id });
  });

  it('peringatan dini wallet: mendanai wallet yang seluruh riwayatnya dipindai dan belum pernah bertransaksi', async () => {
    const fundTx = testTxHash('dana-wallet-baru');
    const funding = { txHash: fundTx, kind: 'transaction' as const, tracePath: '', from: WALLET, to: FRESH, amountRaw: '1', blockNumber: 950, timestamp: new Date('2026-10-02T12:00:00Z') };
    await ingestion.persist(
      scan('ethereum', WALLET, [
        funding,
        { txHash: testTxHash('dana-belum-dipindai'), kind: 'transaction', tracePath: '', from: WALLET, to: UNSCANNED, amountRaw: '1', blockNumber: 960, timestamp: new Date('2026-10-02T13:00:00Z') },
      ]),
      'evm',
    );
    // Seluruh riwayat penerima dipindai (dari blok 0): kiriman ini transaksi pertamanya.
    await ingestion.persist(scan('ethereum', FRESH, [funding]), 'evm');

    const [result] = await service.assessAddress(WALLET, 'ethereum');
    if (result.status !== 'assessed') throw new Error(result.reason);
    const fresh = result.draft.warnings.find((warning) => warning.code === 'fresh_wallet_funding');
    expect(fresh).toMatchObject({ trait: 'fresh_wallet_funding', title: 'Mendanai 1 wallet baru', severity: 'low', evidence: [{ chainId: 'ethereum', txHash: fundTx }] });
    // Penerima yang belum dipindai (termasuk kontrak bridge tanpa label) tidak disebut wallet baru.
    expect(fresh!.description).toContain('2 penerima lain belum dipindai');
    expect(result.draft.score).toBe(15);
    expect(result.draft.traits.find((item) => item.trait === 'fresh_wallet_funding')).toMatchObject({ status: 'detected', warningCode: 'fresh_wallet_funding' });
  });

  it('galat yang jelas untuk chain tak dikenal, address rusak, dan address yang belum tercatat', async () => {
    await expect(service.assessAddress(WALLET, 'mars')).rejects.toMatchObject({ code: 'chain_not_found' });
    await expect(service.assessAddress('0x1234', 'ethereum')).rejects.toBeInstanceOf(RiskScoringError);
    await expect(service.assessAddress('0x' + '99'.repeat(20))).rejects.toMatchObject({ code: 'address_not_found' });
  });
});
