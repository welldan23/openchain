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
  providerRuns,
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

  /** Bukti tiap pemeriksaan kontrak, dikelompokkan per id pemeriksaan. */
  async findContractCheckEvidence(checkIds: number[]): Promise<Map<number, EvidenceRecord[]>> {
    const grouped = new Map<number, EvidenceRecord[]>();
    if (checkIds.length === 0) return grouped;

    const source = alias(addresses, 'source');
    const destination = alias(addresses, 'destination');
    const contract = alias(addresses, 'contract');
    const rows = await this.db
      .select({
        checkId: contractCheckEvidence.checkId,
        evidence,
        sourceAddress: source.address,
        destinationAddress: destination.address,
        contractAddress: contract.address,
      })
      .from(contractCheckEvidence)
      .innerJoin(evidence, eq(contractCheckEvidence.evidenceId, evidence.id))
      .leftJoin(source, eq(evidence.sourceAddressId, source.id))
      .leftJoin(destination, eq(evidence.destinationAddressId, destination.id))
      .leftJoin(contract, eq(evidence.contractAddressId, contract.id))
      .where(inArray(contractCheckEvidence.checkId, checkIds))
      .orderBy(asc(evidence.blockNumber), asc(evidence.id));

    for (const { checkId, ...record } of rows) {
      const list = grouped.get(checkId) ?? [];
      list.push(record);
      grouped.set(checkId, list);
    }
    return grouped;
  }
}
