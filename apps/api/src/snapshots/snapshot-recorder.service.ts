import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { buildEvidenceKey, type EvidenceKeyParts } from '../database/identifiers.js';
import type { DataStatus, InfoClassification } from '../database/schema/enums.js';
import {
  contractCheckEvidence,
  contractChecks,
  evidence,
  holders,
  providerRuns,
  riskFindingEvidence,
  riskFindings,
  tokenSnapshotSources,
  tokenSnapshots,
} from '../database/schema/index.js';
import { classifyFinding, riskLevelFromScore, type RiskLevel } from './classification.js';
import { deriveSnapshotStatus } from './snapshot-status.js';

type Numeric = number | string | null | undefined;
type RiskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type CheckStatus = 'fail' | 'warn' | 'unknown' | 'pass';

export interface RecordSnapshotInput {
  tokenId: number;
  /** Nomor blok (EVM) atau slot (Solana) tempat data diambil. */
  blockNumber: number;
  fetchedAt: Date;
  /** Provider yang membentuk snapshot; status data diturunkan dari sini. */
  providerRunIds: number[];
  /** Total supply mentah pada blok snapshot. */
  totalSupplyRaw?: string | null;
  market?: {
    priceUsd?: Numeric;
    priceChange24hPct?: Numeric;
    marketCapUsd?: Numeric;
    fdvUsd?: Numeric;
    liquidityUsd?: Numeric;
    volume24hUsd?: Numeric;
    holderCount?: number | null;
    txCount24h?: number | null;
  };
  concentration?: { top10Pct?: Numeric; top50Pct?: Numeric };
  /** 0–100; kosong bila risiko belum bisa dinilai. */
  riskScore?: number | null;
  holders?: Array<{ addressId: number; rank: number; balanceRaw: string; sharePct: number | string }>;
  /** Klasifikasi temuan dihitung dari buktinya, tidak diisi pemanggil. */
  findings?: Array<{
    code: string;
    title: string;
    description: string;
    severity: RiskSeverity;
    evidenceIds: number[];
  }>;
  contractChecks?: Array<{
    code: string;
    label: string;
    status: CheckStatus;
    value: string;
    description?: string | null;
    /** Wajib kosong untuk status `unknown`, wajib ada untuk status lain. */
    classification?: InfoClassification | null;
    evidenceIds?: number[];
  }>;
}

export interface RecordedSnapshot {
  snapshotId: number;
  dataStatus: DataStatus;
  riskLevel: RiskLevel;
  findings: Array<{ code: string; classification: InfoClassification }>;
}

export interface RecordEvidenceInput extends Omit<EvidenceKeyParts, 'classification'> {
  classification: InfoClassification;
  explanation: string;
  blockNumber?: number | null;
  blockTimestamp?: Date | null;
  sourceAddressId?: number | null;
  destinationAddressId?: number | null;
  asset?: string | null;
  amountRaw?: string | null;
  contractAddressId?: number | null;
  method?: string | null;
  confidence?: number | string | null;
  providerRunId?: number | null;
  fetchedAt: Date;
}

/** Kesalahan input perekaman, mis. id bukti atau provider yang tidak ada. */
export class SnapshotRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotRecordError';
  }
}

function toNumeric(value: Numeric): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? String(value) : value;
}

function unique(ids: number[]): number[] {
  return [...new Set(ids)];
}

/**
 * Menulis data hasil pengambilan provider ke database. Dipakai adapter dan
 * job pengambilan data, tidak dibuka sebagai endpoint publik.
 */
@Injectable()
export class SnapshotRecorder {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Simpan bukti secara idempotent. Bukti dengan isi kunci yang sama
   * menghasilkan id yang sama, berapa kali pun direkam.
   */
  async recordEvidence(input: RecordEvidenceInput): Promise<number> {
    const evidenceKey = buildEvidenceKey(input);
    await this.db
      .insert(evidence)
      .values({
        evidenceKey,
        chainId: input.chainId,
        classification: input.classification,
        explanation: input.explanation,
        txHash: input.txHash ?? null,
        blockNumber: input.blockNumber ?? null,
        blockTimestamp: input.blockTimestamp ?? null,
        logIndex: input.logIndex ?? null,
        sourceAddressId: input.sourceAddressId ?? null,
        destinationAddressId: input.destinationAddressId ?? null,
        asset: input.asset ?? null,
        amountRaw: input.amountRaw ?? null,
        contractAddressId: input.contractAddressId ?? null,
        method: input.method ?? null,
        heuristicName: input.heuristicName ?? null,
        confidence: toNumeric(input.confidence),
        providerRunId: input.providerRunId ?? null,
        fetchedAt: input.fetchedAt,
      })
      .onConflictDoNothing({ target: evidence.evidenceKey });
    const [row] = await this.db
      .select({ id: evidence.id })
      .from(evidence)
      .where(eq(evidence.evidenceKey, evidenceKey));
    return row.id;
  }

  /**
   * Simpan snapshot token pada sebuah blok dalam satu transaksi. Merekam ulang
   * blok yang sama mengganti isi snapshot itu, sehingga hasilnya deterministik.
   */
  async recordSnapshot(input: RecordSnapshotInput): Promise<RecordedSnapshot> {
    return this.db.transaction(async (tx) => {
      const runIds = unique(input.providerRunIds);
      const runs = runIds.length
        ? await tx.select({ id: providerRuns.id, status: providerRuns.status }).from(providerRuns).where(inArray(providerRuns.id, runIds))
        : [];
      if (runs.length !== runIds.length) {
        const found = new Set(runs.map((run) => run.id));
        const missing = runIds.filter((id) => !found.has(id));
        throw new SnapshotRecordError(`Provider run tidak ditemukan: ${missing.join(', ')}`);
      }

      const evidenceIds = unique([
        ...(input.findings ?? []).flatMap((finding) => finding.evidenceIds),
        ...(input.contractChecks ?? []).flatMap((check) => check.evidenceIds ?? []),
      ]);
      const evidenceRows = evidenceIds.length
        ? await tx
            .select({ id: evidence.id, classification: evidence.classification })
            .from(evidence)
            .where(inArray(evidence.id, evidenceIds))
        : [];
      if (evidenceRows.length !== evidenceIds.length) {
        const found = new Set(evidenceRows.map((row) => row.id));
        const missing = evidenceIds.filter((id) => !found.has(id));
        throw new SnapshotRecordError(`Bukti tidak ditemukan: ${missing.join(', ')}`);
      }
      const classificationOf = new Map(evidenceRows.map((row) => [row.id, row.classification]));

      const dataStatus = deriveSnapshotStatus(runs.map((run) => run.status));
      const riskScore = input.riskScore ?? null;
      const riskLevel = riskLevelFromScore(riskScore);
      const values = {
        fetchedAt: input.fetchedAt,
        dataStatus,
        totalSupplyRaw: input.totalSupplyRaw ?? null,
        priceUsd: toNumeric(input.market?.priceUsd),
        priceChange24hPct: toNumeric(input.market?.priceChange24hPct),
        marketCapUsd: toNumeric(input.market?.marketCapUsd),
        fdvUsd: toNumeric(input.market?.fdvUsd),
        liquidityUsd: toNumeric(input.market?.liquidityUsd),
        volume24hUsd: toNumeric(input.market?.volume24hUsd),
        holderCount: input.market?.holderCount ?? null,
        txCount24h: input.market?.txCount24h ?? null,
        top10Pct: toNumeric(input.concentration?.top10Pct),
        top50Pct: toNumeric(input.concentration?.top50Pct),
        riskScore,
        riskLevel,
      };
      const [snapshot] = await tx
        .insert(tokenSnapshots)
        .values({ tokenId: input.tokenId, blockNumber: input.blockNumber, ...values })
        .onConflictDoUpdate({ target: [tokenSnapshots.tokenId, tokenSnapshots.blockNumber], set: values })
        .returning({ id: tokenSnapshots.id });

      // Ganti seluruh isi snapshot supaya perekaman ulang menghasilkan isi yang sama.
      await tx.delete(tokenSnapshotSources).where(eq(tokenSnapshotSources.snapshotId, snapshot.id));
      await tx.delete(holders).where(eq(holders.snapshotId, snapshot.id));
      await tx.delete(riskFindings).where(eq(riskFindings.snapshotId, snapshot.id));
      await tx.delete(contractChecks).where(eq(contractChecks.snapshotId, snapshot.id));

      if (runIds.length) {
        await tx.insert(tokenSnapshotSources).values(runIds.map((providerRunId) => ({ snapshotId: snapshot.id, providerRunId })));
      }
      if (input.holders?.length) {
        await tx.insert(holders).values(
          input.holders.map((holder) => ({
            snapshotId: snapshot.id,
            addressId: holder.addressId,
            rank: holder.rank,
            balanceRaw: holder.balanceRaw,
            sharePct: String(holder.sharePct),
          })),
        );
      }

      const recordedFindings: RecordedSnapshot['findings'] = [];
      for (const finding of input.findings ?? []) {
        const ids = unique(finding.evidenceIds);
        const classification = classifyFinding(ids.map((id) => classificationOf.get(id)!));
        const [row] = await tx
          .insert(riskFindings)
          .values({
            snapshotId: snapshot.id,
            code: finding.code,
            title: finding.title,
            description: finding.description,
            severity: finding.severity,
            classification,
          })
          .returning({ id: riskFindings.id });
        if (ids.length) {
          await tx.insert(riskFindingEvidence).values(ids.map((evidenceId) => ({ findingId: row.id, evidenceId })));
        }
        recordedFindings.push({ code: finding.code, classification });
      }

      for (const check of input.contractChecks ?? []) {
        const ids = unique(check.evidenceIds ?? []);
        const [row] = await tx
          .insert(contractChecks)
          .values({
            snapshotId: snapshot.id,
            code: check.code,
            label: check.label,
            status: check.status,
            value: check.value,
            description: check.description ?? null,
            classification: check.classification ?? null,
          })
          .returning({ id: contractChecks.id });
        if (ids.length) {
          await tx.insert(contractCheckEvidence).values(ids.map((evidenceId) => ({ checkId: row.id, evidenceId })));
        }
      }

      return { snapshotId: snapshot.id, dataStatus, riskLevel, findings: recordedFindings };
    });
  }
}
