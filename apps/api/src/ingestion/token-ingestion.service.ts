/**
 * Menyimpan hasil pengumpulan adapter chain ke database: run provider,
 * address, profil token, label eksternal, bukti, dan snapshot.
 *
 * Semua langkah idempotent. Address yang sudah ada tidak digandakan dan
 * identifier aslinya tidak diubah; bukti memakai `evidence_key`; snapshot pada
 * blok yang sama diganti isinya. Run provider selalu disimpan, termasuk saat
 * pengambilan gagal, supaya alasan kegagalan bisa ditelusuri.
 */
import { eq, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { ChainAdapter, TokenCollection } from '../chains/chain-adapter.types.js';
import { ChainNotSupportedError } from '../chains/chain-registry.js';
import type { Database } from '../database/database.module.js';
import { insertProviderRuns, upsertAddresses, type StoredRun } from '../database/address-store.js';
import { normalizeAddress } from '../database/identifiers.js';
import type { ChainFamily, CheckStatus, DataStatus } from '../database/schema/enums.js';
import { chains, labels, tokens } from '../database/schema/index.js';
import type { RecordSnapshotInput, SnapshotRecorder } from '../snapshots/snapshot-recorder.service.js';

export interface AdapterSource {
  adapter(chainId: string): ChainAdapter;
}

export type IngestedRun = StoredRun;

export interface IngestionResult {
  chainId: string;
  address: string;
  /** Alasan snapshot tidak dibuat; `null` bila berhasil. */
  failure: string | null;
  tokenId: number | null;
  snapshot: { id: number; blockNumber: number; dataStatus: DataStatus } | null;
  token: { name: string | null; symbol: string | null; decimals: number | null; totalSupplyRaw: string | null } | null;
  holderCount: number | null;
  holdersStored: number | null;
  concentration: { top10Pct: string; top50Pct: string } | null;
  checks: Record<CheckStatus, number>;
  runs: IngestedRun[];
}

export class TokenIngestionService {
  constructor(
    private readonly db: Database,
    private readonly recorder: SnapshotRecorder,
    private readonly adapters: AdapterSource,
  ) {}

  /** Ambil data token dari chain lalu simpan sebagai snapshot pada blok terbaru. */
  async ingest(chainId: string, address: string): Promise<IngestionResult> {
    const [chain] = await this.db.select({ family: chains.family }).from(chains).where(eq(chains.id, chainId)).limit(1);
    if (!chain) {
      throw new ChainNotSupportedError(`Chain "${chainId}" belum ada di database. Jalankan npm run db:migrate.`);
    }
    const collection = await this.adapters.adapter(chainId).collectToken(address);
    return this.persist(collection, chain.family);
  }

  /** Simpan hasil pengumpulan. Dipisah dari `ingest` supaya bisa diuji tanpa jaringan. */
  async persist(collection: TokenCollection, family: ChainFamily): Promise<IngestionResult> {
    const runs = await insertProviderRuns(this.db, collection.chainId, collection.runs);
    const runIdByKey = new Map(collection.runs.map((run, index) => [run.key, runs[index].id]));
    const result: IngestionResult = {
      chainId: collection.chainId,
      address: collection.address,
      failure: collection.failure,
      tokenId: null,
      snapshot: null,
      token: null,
      holderCount: null,
      holdersStored: null,
      concentration: null,
      checks: { fail: 0, warn: 0, unknown: 0, pass: 0 },
      runs,
    };
    const token = collection.token;
    if (collection.failure !== null || token === null || collection.blockNumber === null) {
      return { ...result, failure: collection.failure ?? 'Data on-chain token tidak lengkap.' };
    }

    const normalize = (value: string) => normalizeAddress(family, value);
    const addressIds = await upsertAddresses(this.db, collection.chainId, family, [
      { address: collection.address, isContract: true },
      ...(token.deployer ? [{ address: token.deployer, isContract: null }] : []),
      ...(collection.holders ?? []).map((holder) => ({ address: holder.address, isContract: holder.isContract })),
    ]);
    const idOf = (value: string) => {
      const id = addressIds.get(normalize(value));
      if (id === undefined) throw new Error(`Address ${value} belum tersimpan`);
      return id;
    };

    const tokenId = await this.upsertToken(collection, idOf);
    await this.upsertHolderLabels(collection, idOf, runIdByKey);

    const contractChecks: NonNullable<RecordSnapshotInput['contractChecks']> = [];
    for (const check of collection.checks) {
      const evidenceIds: number[] = [];
      for (const item of check.evidence) {
        evidenceIds.push(
          await this.recorder.recordEvidence({
            chainId: collection.chainId,
            classification: item.classification,
            explanation: item.explanation,
            subject: item.subject,
            txHash: item.txHash ?? null,
            blockNumber: item.blockNumber ?? null,
            blockTimestamp: item.blockTimestamp ?? null,
            method: item.method ?? null,
            contractAddressId: item.contractAddress ? idOf(item.contractAddress) : null,
            providerRunId: runIdByKey.get(item.runKey) ?? null,
            fetchedAt: collection.fetchedAt,
          }),
        );
      }
      contractChecks.push({
        code: check.code,
        label: check.label,
        status: check.status,
        value: check.value,
        description: check.description,
        classification: check.classification,
        evidenceIds,
      });
      result.checks[check.status] += 1;
    }

    const recorded = await this.recorder.recordSnapshot({
      tokenId,
      blockNumber: collection.blockNumber,
      fetchedAt: collection.fetchedAt,
      providerRunIds: runs.map((run) => run.id),
      totalSupplyRaw: token.totalSupplyRaw,
      market: { ...collection.market, holderCount: collection.holderCount },
      concentration: collection.concentration ?? undefined,
      // Skor risiko dihitung di fitur Risiko & Label (fase 3); sampai itu `unknown`.
      riskScore: null,
      holders: (collection.holders ?? []).map((holder) => ({
        addressId: idOf(holder.address),
        rank: holder.rank,
        balanceRaw: holder.balanceRaw,
        sharePct: holder.sharePct,
      })),
      findings: [],
      contractChecks,
    });

    return {
      ...result,
      tokenId,
      snapshot: { id: recorded.snapshotId, blockNumber: collection.blockNumber, dataStatus: recorded.dataStatus },
      token: { name: token.name, symbol: token.symbol, decimals: token.decimals, totalSupplyRaw: token.totalSupplyRaw },
      holderCount: collection.holderCount,
      holdersStored: collection.holders?.length ?? null,
      concentration: collection.concentration,
    };
  }

  /** Profil token terbaru; nilai yang kali ini gagal diambil tidak menimpa nilai lama. */
  private async upsertToken(collection: TokenCollection, idOf: (address: string) => number): Promise<number> {
    const token = collection.token!;
    const keep = (column: AnyPgColumn) => sql`coalesce(excluded.${sql.identifier(column.name)}, ${column})`;
    const [row] = await this.db
      .insert(tokens)
      .values({
        chainId: collection.chainId,
        addressId: idOf(collection.address),
        standard: token.standard,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        totalSupplyRaw: token.totalSupplyRaw,
        deployerAddressId: token.deployer ? idOf(token.deployer) : null,
        deployTxHash: token.deployTxHash,
        deployedAt: token.deployedAt,
        sourceVerified: token.sourceVerified,
      })
      .onConflictDoUpdate({
        target: tokens.addressId,
        set: {
          name: keep(tokens.name),
          symbol: keep(tokens.symbol),
          decimals: keep(tokens.decimals),
          totalSupplyRaw: keep(tokens.totalSupplyRaw),
          deployerAddressId: keep(tokens.deployerAddressId),
          deployTxHash: keep(tokens.deployTxHash),
          deployedAt: keep(tokens.deployedAt),
          sourceVerified: keep(tokens.sourceVerified),
          updatedAt: new Date(),
        },
      })
      .returning({ id: tokens.id });
    return row.id;
  }

  /** Label eksternal holder dari indexer, dengan sumber dan run provider-nya. */
  private async upsertHolderLabels(
    collection: TokenCollection,
    idOf: (address: string) => number,
    runIdByKey: Map<string, number>,
  ): Promise<void> {
    const indexerRun = collection.runs.find((run) => run.kind === 'indexed_data');
    const rows = (collection.holders ?? []).flatMap((holder) =>
      holder.labels.map((label) => ({
        addressId: idOf(holder.address),
        labelType: label.type,
        name: label.name,
        source: 'external' as const,
        sourceName: indexerRun ? displayName(indexerRun.provider) : 'Indexer',
        classification: 'external_label' as const,
        providerRunId: indexerRun ? (runIdByKey.get(indexerRun.key) ?? null) : null,
      })),
    );
    if (rows.length === 0) return;
    await this.db
      .insert(labels)
      .values(rows)
      .onConflictDoUpdate({
        target: [labels.addressId, labels.labelType, labels.sourceName],
        set: { name: sql`excluded.name`, providerRunId: sql`excluded.provider_run_id` },
      });
  }
}

function displayName(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
