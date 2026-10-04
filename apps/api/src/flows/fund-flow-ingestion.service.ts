/**
 * Menyimpan hasil `FundFlowCollector` ke database: run provider, address,
 * token yang ditransfer, transfer native dan token, serta cakupan pemindaian.
 *
 * Idempotent: transfer yang sama (chain, hash, posisi) tidak digandakan saat
 * address dikumpulkan ulang, dan metadata token yang sudah dibaca lewat RPC
 * tidak ditimpa metadata dari indexer. Label eksternal pihak transfer ikut
 * disimpan, lalu jenis tiap perpindahan diklasifikasikan. Nilai USD saat transaksi belum diisi
 * karena belum ada sumber harga historis; kolomnya dibiarkan kosong, bukan nol.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { insertProviderRuns, upsertAddresses, type StoredRun } from '../database/address-store.js';
import { normalizeAddress, normalizeTxHash } from '../database/identifiers.js';
import type { ChainFamily, DataStatus } from '../database/schema/enums.js';
import { addressFlowScans, labels, nativeTransfers, tokens, tokenTransfers } from '../database/schema/index.js';
import type { AddressFlowCollection } from './fund-flow.types.js';
import { MovementClassificationService } from './movement-classification.service.js';

const CHUNK = 500;

export interface FlowIngestionResult {
  /** Label eksternal pihak transfer yang disimpan atau diperbarui. */
  labelsStored: number;
  /** Perpindahan yang jenisnya diklasifikasikan. */
  classified: number;
  chainId: string;
  address: string;
  /** `null` bila rentang blok tidak diketahui sama sekali. */
  scanId: number | null;
  status: DataStatus;
  statusReason: string | null;
  failure: string | null;
  native: { found: number; inserted: number };
  tokens: { found: number; inserted: number };
  runs: StoredRun[];
}

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK) result.push(items.slice(start, start + CHUNK));
  return result;
}

export class FundFlowIngestionService {
  private readonly classifier: MovementClassificationService;

  constructor(private readonly db: Database) {
    this.classifier = new MovementClassificationService(db);
  }

  async persist(collection: AddressFlowCollection, family: ChainFamily): Promise<FlowIngestionResult> {
    const { chainId } = collection;
    const runs = await insertProviderRuns(this.db, chainId, collection.runs);
    const runId = (operation: string) => runs[collection.runs.findIndex((run) => run.operation === operation)]?.id ?? null;
    const normalize = (value: string) => normalizeAddress(family, value);

    const tokenContracts = new Map(collection.tokenTransfers.map((transfer) => [normalize(transfer.token.address), transfer.token]));
    const addressIds = await upsertAddresses(this.db, chainId, family, [
      { address: collection.address, isContract: null },
      ...collection.nativeTransfers.flatMap((transfer) => [
        { address: transfer.from, isContract: null },
        { address: transfer.to, isContract: null },
      ]),
      ...collection.tokenTransfers.flatMap((transfer) => [
        { address: transfer.from, isContract: null },
        { address: transfer.to, isContract: null },
      ]),
      ...[...tokenContracts.values()].map((token) => ({ address: token.address, isContract: true })),
    ]);
    const idOf = (value: string) => {
      const id = addressIds.get(normalize(value));
      if (id === undefined) throw new Error(`Address ${value} belum tersimpan`);
      return id;
    };
    const tokenIds = await this.upsertTokens(chainId, [...tokenContracts.values()], idOf, normalize);

    const nativeRows = collection.nativeTransfers.map((transfer) => ({
      chainId,
      txHash: normalizeTxHash(family, transfer.txHash),
      kind: transfer.kind,
      tracePath: transfer.tracePath,
      fromAddressId: idOf(transfer.from),
      toAddressId: idOf(transfer.to),
      amountRaw: transfer.amountRaw,
      blockNumber: transfer.blockNumber,
      blockTimestamp: transfer.timestamp,
      providerRunId: runId(transfer.kind === 'internal' ? 'address.internal_transfers' : 'address.native_transfers'),
      fetchedAt: collection.fetchedAt,
    }));
    let nativeInserted = 0;
    for (const chunk of chunks(nativeRows)) {
      const inserted = await this.db.insert(nativeTransfers).values(chunk).onConflictDoNothing().returning({ id: nativeTransfers.id });
      nativeInserted += inserted.length;
    }

    const tokenRows = collection.tokenTransfers.map((transfer) => {
      const tokenId = tokenIds.get(normalize(transfer.token.address));
      if (tokenId === undefined) throw new Error(`Token ${transfer.token.address} belum tersimpan`);
      return {
        chainId,
        txHash: normalizeTxHash(family, transfer.txHash),
        logIndex: transfer.logIndex,
        tokenId,
        fromAddressId: idOf(transfer.from),
        toAddressId: idOf(transfer.to),
        amountRaw: transfer.amountRaw,
        blockNumber: transfer.blockNumber,
        blockTimestamp: transfer.timestamp,
        providerRunId: runId('address.token_transfers'),
        fetchedAt: collection.fetchedAt,
      };
    });
    let tokensInserted = 0;
    for (const chunk of chunks(tokenRows)) {
      const inserted = await this.db.insert(tokenTransfers).values(chunk).onConflictDoNothing().returning({ id: tokenTransfers.id });
      tokensInserted += inserted.length;
    }

    const labelsStored = await this.upsertPartyLabels(collection, runs, normalize, (value) => addressIds.get(normalize(value)));
    const classified = await this.classifier.classify(
      {
        nativeIds: await this.nativeIdsOf(chainId, nativeRows),
        tokenIds: await this.tokenIdsOf(chainId, tokenRows),
      },
      collection.fetchedAt,
    );

    const scan = collection.scan;
    let scanId: number | null = null;
    if (scan) {
      const [row] = await this.db
        .insert(addressFlowScans)
        .values({
          chainId,
          addressId: idOf(collection.address),
          ...scan,
          providerRunId: runId('address.native_transfers') ?? runId('chain.head'),
          scannedAt: collection.fetchedAt,
        })
        .returning({ id: addressFlowScans.id });
      scanId = row.id;
    }

    return {
      chainId,
      address: collection.address,
      scanId,
      status: scan?.status ?? 'unavailable',
      statusReason: scan?.statusReason ?? collection.failure,
      failure: collection.failure,
      labelsStored,
      classified,
      native: { found: nativeRows.length, inserted: nativeInserted },
      tokens: { found: tokenRows.length, inserted: tokensInserted },
      runs,
    };
  }

  /** Id transfer native dalam koleksi ini, termasuk yang sudah tersimpan sebelumnya. */
  private async nativeIdsOf(chainId: string, rows: Array<{ txHash: string; kind: string; tracePath: string }>): Promise<number[]> {
    const wanted = new Set(rows.map((row) => `${row.txHash}|${row.kind}|${row.tracePath}`));
    const ids: number[] = [];
    for (const chunk of chunks([...new Set(rows.map((row) => row.txHash))])) {
      const found = await this.db
        .select({ id: nativeTransfers.id, txHash: nativeTransfers.txHash, kind: nativeTransfers.kind, tracePath: nativeTransfers.tracePath })
        .from(nativeTransfers)
        .where(and(eq(nativeTransfers.chainId, chainId), inArray(nativeTransfers.txHash, chunk)));
      for (const row of found) if (wanted.has(`${row.txHash}|${row.kind}|${row.tracePath}`)) ids.push(row.id);
    }
    return ids;
  }

  private async tokenIdsOf(chainId: string, rows: Array<{ txHash: string; logIndex: number }>): Promise<number[]> {
    const wanted = new Set(rows.map((row) => `${row.txHash}|${row.logIndex}`));
    const ids: number[] = [];
    for (const chunk of chunks([...new Set(rows.map((row) => row.txHash))])) {
      const found = await this.db
        .select({ id: tokenTransfers.id, txHash: tokenTransfers.txHash, logIndex: tokenTransfers.logIndex })
        .from(tokenTransfers)
        .where(and(eq(tokenTransfers.chainId, chainId), inArray(tokenTransfers.txHash, chunk)));
      for (const row of found) if (wanted.has(`${row.txHash}|${row.logIndex}`)) ids.push(row.id);
    }
    return ids;
  }

  /**
   * Label eksternal pihak transfer dari indexer (mis. tag Blockscout), dengan
   * sumber dan run provider-nya. Label yang sama dari sumber yang sama diganti.
   */
  private async upsertPartyLabels(
    collection: AddressFlowCollection,
    runs: StoredRun[],
    normalize: (address: string) => string,
    idOf: (address: string) => number | undefined,
  ): Promise<number> {
    const runIdByKey = new Map(collection.runs.map((run, index) => [run.key, runs[index]?.id ?? null]));
    const providerByKey = new Map(collection.runs.map((run) => [run.key, run.provider]));
    const seen = new Set<string>();
    const rows = collection.partyLabels.flatMap((entry) => {
      const addressId = idOf(entry.address);
      if (addressId === undefined) return [];
      const provider = providerByKey.get(entry.runKey) ?? 'indexer';
      const sourceName = provider.charAt(0).toUpperCase() + provider.slice(1);
      return entry.labels.flatMap((label) => {
        const key = `${normalize(entry.address)}|${label.type}|${sourceName}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          {
            addressId,
            labelType: label.type,
            name: label.name,
            source: 'external' as const,
            sourceName,
            classification: 'external_label' as const,
            providerRunId: runIdByKey.get(entry.runKey) ?? null,
          },
        ];
      });
    });
    if (rows.length === 0) return 0;
    await this.db
      .insert(labels)
      .values(rows)
      .onConflictDoUpdate({
        target: [labels.addressId, labels.labelType, labels.sourceName],
        set: { name: sql`excluded.name`, providerRunId: sql`excluded.provider_run_id` },
      });
    return rows.length;
  }

  /**
   * Token yang ditransfer, sebagai ERC-20. Metadata indexer hanya mengisi
   * yang masih kosong, supaya hasil baca RPC dari ingest token tidak tertimpa.
   */
  private async upsertTokens(
    chainId: string,
    entries: Array<{ address: string; name: string | null; symbol: string | null; decimals: number | null }>,
    idOf: (address: string) => number,
    normalize: (address: string) => string,
  ): Promise<Map<string, number>> {
    const ids = new Map<string, number>();
    if (entries.length === 0) return ids;
    const byAddressId = new Map(entries.map((entry) => [idOf(entry.address), entry]));
    for (const chunk of chunks([...byAddressId])) {
      await this.db
        .insert(tokens)
        .values(
          chunk.map(([addressId, entry]) => ({
            chainId,
            addressId,
            standard: 'erc20' as const,
            name: entry.name,
            symbol: entry.symbol,
            decimals: entry.decimals,
          })),
        )
        .onConflictDoUpdate({
          target: tokens.addressId,
          set: {
            name: sql`coalesce(${tokens.name}, excluded.name)`,
            symbol: sql`coalesce(${tokens.symbol}, excluded.symbol)`,
            decimals: sql`coalesce(${tokens.decimals}, excluded.decimals)`,
          },
        });
      const rows = await this.db
        .select({ id: tokens.id, addressId: tokens.addressId })
        .from(tokens)
        .where(and(eq(tokens.chainId, chainId), inArray(tokens.addressId, chunk.map(([addressId]) => addressId))));
      const addressById = new Map(chunk.map(([addressId, entry]) => [addressId, entry.address]));
      for (const row of rows) {
        const address = addressById.get(row.addressId);
        if (address) ids.set(normalize(address), row.id);
      }
    }
    return ids;
  }
}
