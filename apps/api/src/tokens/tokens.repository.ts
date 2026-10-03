import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  addresses,
  chains,
  contractCheckEvidence,
  contractChecks,
  evidence,
  holders,
  labels,
  providerRuns,
  riskFindingEvidence,
  riskFindings,
  tokens,
  tokenSnapshotSources,
  tokenSnapshots,
} from '../database/schema/index.js';
import type { EvidenceRecord } from './evidence.view.js';

/** Query baca untuk data token. Tidak ada operasi tulis di sini. */
@Injectable()
export class TokensRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findChain(chainId: string) {
    const [chain] = await this.db.select().from(chains).where(eq(chains.id, chainId)).limit(1);
    return chain ?? null;
  }

  /** Cari token lewat address ternormalisasi, beserta address deployer-nya. */
  async findToken(chainId: string, addressNormalized: string) {
    const deployer = alias(addresses, 'deployer');
    const [row] = await this.db
      .select({ token: tokens, address: addresses.address, deployer: deployer.address })
      .from(tokens)
      .innerJoin(addresses, eq(tokens.addressId, addresses.id))
      .leftJoin(deployer, eq(tokens.deployerAddressId, deployer.id))
      .where(and(eq(tokens.chainId, chainId), eq(addresses.addressNormalized, addressNormalized)))
      .limit(1);
    return row ?? null;
  }

  /** Snapshot pada blok tertentu, atau yang terbaru bila blok tidak diminta. */
  async findSnapshot(tokenId: number, blockNumber?: number) {
    const query = this.db.select().from(tokenSnapshots);
    const [snapshot] =
      blockNumber === undefined
        ? await query
            .where(eq(tokenSnapshots.tokenId, tokenId))
            .orderBy(desc(tokenSnapshots.blockNumber))
            .limit(1)
        : await query
            .where(and(eq(tokenSnapshots.tokenId, tokenId), eq(tokenSnapshots.blockNumber, blockNumber)))
            .limit(1);
    return snapshot ?? null;
  }

  /** Provider yang dipakai untuk membentuk snapshot. */
  async findSnapshotSources(snapshotId: number) {
    const rows = await this.db
      .select({ run: providerRuns })
      .from(tokenSnapshotSources)
      .innerJoin(providerRuns, eq(tokenSnapshotSources.providerRunId, providerRuns.id))
      .where(eq(tokenSnapshotSources.snapshotId, snapshotId))
      .orderBy(asc(providerRuns.id));
    return rows.map((row) => row.run);
  }

  /** Hasil cek kontrak pada sebuah snapshot, dalam urutan simpan. */
  async findContractChecks(snapshotId: number) {
    return this.db
      .select()
      .from(contractChecks)
      .where(eq(contractChecks.snapshotId, snapshotId))
      .orderBy(asc(contractChecks.id));
  }

  /** Holder teratas pada snapshot, urut peringkat. */
  async findHolders(snapshotId: number, limit: number) {
    return this.db
      .select({
        rank: holders.rank,
        addressId: holders.addressId,
        address: addresses.address,
        balanceRaw: holders.balanceRaw,
        sharePct: holders.sharePct,
      })
      .from(holders)
      .innerJoin(addresses, eq(holders.addressId, addresses.id))
      .where(eq(holders.snapshotId, snapshotId))
      .orderBy(asc(holders.rank))
      .limit(limit);
  }

  /** Label entitas untuk sekumpulan address, dikelompokkan per address. */
  async findLabels(addressIds: number[]) {
    const grouped = new Map<number, (typeof labels.$inferSelect)[]>();
    if (addressIds.length === 0) return grouped;
    const rows = await this.db
      .select()
      .from(labels)
      .where(inArray(labels.addressId, addressIds))
      .orderBy(asc(labels.id));
    for (const row of rows) {
      const list = grouped.get(row.addressId) ?? [];
      list.push(row);
      grouped.set(row.addressId, list);
    }
    return grouped;
  }

  /** Bukti tiap pemeriksaan kontrak, dikelompokkan per id pemeriksaan. */
  async findContractCheckEvidence(checkIds: number[]): Promise<Map<number, EvidenceRecord[]>> {
    const grouped = new Map<number, EvidenceRecord[]>();
    const links = await this.findCheckEvidenceLinks(checkIds);
    const records = await this.findEvidenceRecords(links.map((link) => link.evidenceId));
    for (const link of links) {
      const record = records.get(link.evidenceId);
      if (!record) continue;
      const list = grouped.get(link.checkId) ?? [];
      list.push(record);
      grouped.set(link.checkId, list);
    }
    for (const list of grouped.values()) list.sort(byBlockAscending);
    return grouped;
  }

  /** Temuan risiko pada sebuah snapshot, dalam urutan simpan. */
  async findRiskFindings(snapshotId: number) {
    return this.db
      .select()
      .from(riskFindings)
      .where(eq(riskFindings.snapshotId, snapshotId))
      .orderBy(asc(riskFindings.id));
  }

  /** Pasangan temuan dan bukti yang mendukungnya. */
  async findFindingEvidenceLinks(findingIds: number[]) {
    if (findingIds.length === 0) return [];
    return this.db
      .select({ findingId: riskFindingEvidence.findingId, evidenceId: riskFindingEvidence.evidenceId })
      .from(riskFindingEvidence)
      .where(inArray(riskFindingEvidence.findingId, findingIds));
  }

  /** Pasangan pemeriksaan kontrak dan bukti yang mendukungnya. */
  async findCheckEvidenceLinks(checkIds: number[]) {
    if (checkIds.length === 0) return [];
    return this.db
      .select({ checkId: contractCheckEvidence.checkId, evidenceId: contractCheckEvidence.evidenceId })
      .from(contractCheckEvidence)
      .where(inArray(contractCheckEvidence.checkId, checkIds));
  }

  /** Bukti beserta address sumber, tujuan, dan kontraknya, per id bukti. */
  async findEvidenceRecords(evidenceIds: number[]): Promise<Map<number, EvidenceRecord>> {
    const records = new Map<number, EvidenceRecord>();
    const uniqueIds = [...new Set(evidenceIds)];
    if (uniqueIds.length === 0) return records;

    const source = alias(addresses, 'source');
    const destination = alias(addresses, 'destination');
    const contract = alias(addresses, 'contract');
    const rows = await this.db
      .select({
        evidence,
        sourceAddress: source.address,
        destinationAddress: destination.address,
        contractAddress: contract.address,
      })
      .from(evidence)
      .leftJoin(source, eq(evidence.sourceAddressId, source.id))
      .leftJoin(destination, eq(evidence.destinationAddressId, destination.id))
      .leftJoin(contract, eq(evidence.contractAddressId, contract.id))
      .where(inArray(evidence.id, uniqueIds));
    for (const row of rows) records.set(row.evidence.id, row);
    return records;
  }
}

/** Bukti lama lebih dulu; bukti tanpa nomor blok di akhir. */
function byBlockAscending(a: EvidenceRecord, b: EvidenceRecord): number {
  const blockA = a.evidence.blockNumber ?? Number.MAX_SAFE_INTEGER;
  const blockB = b.evidence.blockNumber ?? Number.MAX_SAFE_INTEGER;
  return blockA - blockB || a.evidence.id - b.evidence.id;
}
