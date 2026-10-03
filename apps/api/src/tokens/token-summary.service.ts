import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '../common/clock.js';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import { toTokenSummary } from './token-summary.mapper.js';
import type { TokenSummaryResponse } from './token-summary.types.js';
import { TokensRepository } from './tokens.repository.js';

/** Batas umur snapshot sebelum dianggap basi, bila tidak diatur lewat env. */
export const DEFAULT_STALE_AFTER_MINUTES = 60;

@Injectable()
export class TokenSummaryService {
  private readonly staleAfterMinutes: number;

  constructor(
    private readonly repository: TokensRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService,
  ) {
    const configured = Number(config.get('SNAPSHOT_STALE_AFTER_MINUTES'));
    this.staleAfterMinutes =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STALE_AFTER_MINUTES;
  }

  async getSummary(chainId: string, rawAddress: string, blockNumber?: number): Promise<TokenSummaryResponse> {
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
    const sources = snapshot ? await this.repository.findSnapshotSources(snapshot.id) : [];

    return toTokenSummary(
      { chain, token: found.token, address: found.address, deployer: found.deployer, snapshot, sources },
      this.clock.now(),
      this.staleAfterMinutes,
    );
  }
}
