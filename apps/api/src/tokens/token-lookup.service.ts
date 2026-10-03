import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import type { ChainRow, SnapshotRow, TokenRow } from './rows.js';
import { TokensRepository } from './tokens.repository.js';

export interface ResolvedToken {
  chain: ChainRow;
  token: TokenRow;
  /** Identifier asli address token. */
  address: string;
  deployer: string | null;
  /** Snapshot pada blok yang diminta, atau yang terbaru; `null` bila belum ada. */
  snapshot: SnapshotRow | null;
}

/**
 * Langkah bersama semua endpoint token: validasi chain, normalisasi address,
 * cari token, lalu ambil snapshot. Melempar 404/400 dengan pesan yang jelas.
 */
@Injectable()
export class TokenLookupService {
  constructor(private readonly repository: TokensRepository) {}

  async resolve(chainId: string, rawAddress: string, blockNumber?: number): Promise<ResolvedToken> {
    const chain = await this.repository.findChain(chainId);
    if (!chain) throw new NotFoundException(`Chain "${chainId}" tidak dikenal.`);

    let normalized: string;
    try {
      normalized = normalizeAddress(chain.family, rawAddress);
    } catch (error) {
      if (error instanceof InvalidIdentifierError) throw new BadRequestException(error.message);
      throw error;
    }

    const found = await this.repository.findToken(chain.id, normalized);
    if (!found) throw new NotFoundException(`Token ${rawAddress} di ${chain.name} tidak ditemukan.`);

    const snapshot = await this.repository.findSnapshot(found.token.id, blockNumber);
    if (blockNumber !== undefined && !snapshot) {
      throw new NotFoundException(`Snapshot token pada blok ${blockNumber} tidak ditemukan.`);
    }

    return { chain, token: found.token, address: found.address, deployer: found.deployer, snapshot };
  }
}
