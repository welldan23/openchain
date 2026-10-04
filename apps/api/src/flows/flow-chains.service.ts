import { BadRequestException, Injectable } from '@nestjs/common';
import { EVM_CHAIN_DEFINITIONS, PHASE_4_CHAINS } from '../chains/chain-definitions.js';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import type { FlowChainsResponse } from './flow-chains.types.js';
import { toChainInfo, toFailedAttempt, toScanInfo } from './flow-summary.mapper.js';
import { FlowsRepository } from './flows.repository.js';

/** Keluarga chain yang aturan format address-nya sudah ada; sisanya menyusul di fase 4. */
const VALIDATED_FAMILIES = new Set<string>(['evm', 'solana']);

/** Urutan prioritas adapter sesuai PRD. */
const CHAIN_ORDER = [...EVM_CHAIN_DEFINITIONS.map((definition) => definition.id), ...PHASE_4_CHAINS];

/**
 * Status aliran dana satu address di setiap chain yang format address-nya
 * cocok. Chain yang belum dipindai tetap tampil, dengan jumlah transfer
 * `null`, supaya "belum dipindai" tidak terbaca sebagai "tidak ada transfer".
 */
@Injectable()
export class FlowChainsService {
  constructor(
    private readonly repository: FlowsRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getChains(rawAddress: string, requested?: string[]): Promise<FlowChainsResponse> {
    const all = await this.repository.listChains();
    const rank = (id: string) => (CHAIN_ORDER.includes(id) ? CHAIN_ORDER.indexOf(id) : CHAIN_ORDER.length);
    let candidates = [...all].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
    if (requested) {
      const unknown = requested.filter((id) => !all.some((chain) => chain.id === id));
      if (unknown.length > 0) throw new BadRequestException(`Chain tidak dikenal: ${unknown.join(', ')}.`);
      candidates = candidates.filter((chain) => requested.includes(chain.id));
      const pending = candidates.filter((chain) => !VALIDATED_FAMILIES.has(chain.family)).map((chain) => chain.id);
      if (pending.length > 0) throw new BadRequestException(`Chain belum didukung (dijadwalkan fase 4): ${pending.join(', ')}.`);
    } else {
      candidates = candidates.filter((chain) => VALIDATED_FAMILIES.has(chain.family));
    }

    // Hanya chain yang format address-nya cocok, mis. 0x… untuk chain EVM.
    const compatible = candidates.flatMap((chain) => {
      try {
        return [{ chain, normalized: normalizeAddress(chain.family, rawAddress) }];
      } catch (error) {
        if (error instanceof InvalidIdentifierError) return [];
        throw error;
      }
    });
    if (requested && compatible.length < candidates.length) {
      const mismatch = candidates.filter((chain) => !compatible.some((item) => item.chain.id === chain.id)).map((chain) => chain.id);
      throw new BadRequestException(`Format address tidak cocok dengan chain: ${mismatch.join(', ')}.`);
    }
    if (compatible.length === 0) throw new BadRequestException('Format address tidak dikenali di chain mana pun.');

    const now = this.freshness.now();
    const chains = await Promise.all(
      compatible.map(async ({ chain, normalized }) => {
        const address = await this.repository.findAddress(chain.id, normalized);
        const scan = address ? await this.repository.findScan(chain.id, address.id) : null;
        const failed = address ? await this.repository.findFailedAttemptAfter(chain.id, address.id, scan?.scannedAt ?? null) : null;
        const scanInfo = scan ? toScanInfo(scan, now, this.freshness.staleAfterMinutes) : null;
        return {
          chain: toChainInfo(chain),
          known: address !== null,
          scan: scanInfo,
          lastFailedAttempt: toFailedAttempt(failed),
          transferCount: address && scan ? await this.repository.countTransfers(chain.id, address.id, scan.blockFrom, scan.blockTo) : null,
          dataStatus: scanInfo?.dataStatus ?? 'unavailable',
        };
      }),
    );
    return { address: rawAddress.trim(), chains };
  }
}
