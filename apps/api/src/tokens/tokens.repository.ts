import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  addresses,
  chains,
  providerRuns,
  tokens,
  tokenSnapshotSources,
  tokenSnapshots,
} from '../database/schema/index.js';

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
}
