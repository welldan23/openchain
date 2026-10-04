import { BadRequestException, Injectable } from '@nestjs/common';
import { formatUnits, numericToNumber } from '../common/units.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { FlowLookupService, type FlowQuery } from './flow-lookup.service.js';
import { nativeAssetOf, toChainInfo, toFailedAttempt, toScanInfo, toWindowView } from './flow-summary.mapper.js';
import type { FlowAsset } from './flow-summary.types.js';
import type { FlowTransfersResponse, FlowTransferView } from './flow-transfers.types.js';
import { FlowsRepository, type TransferCursor } from './flows.repository.js';

export const DEFAULT_TRANSFER_LIMIT = 50;
export const MAX_TRANSFER_LIMIT = 200;

export interface FlowTransfersQuery extends FlowQuery {
  direction?: 'in' | 'out';
  limit?: number;
  cursor?: string;
}

export function encodeCursor(cursor: TransferCursor): string {
  return Buffer.from(JSON.stringify([cursor.blockNumber, cursor.sourceRank, cursor.id])).toString('base64url');
}

export function decodeCursor(value: string): TransferCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((part) => Number.isSafeInteger(part) && part >= 0)) {
      const [blockNumber, sourceRank, id] = parsed as number[];
      return { blockNumber, sourceRank, id };
    }
  } catch {
    // Jatuh ke pesan di bawah.
  }
  throw new BadRequestException('Parameter cursor tidak valid. Pakai nilai nextCursor dari respons sebelumnya.');
}

/** Daftar transfer satu address dari pemindaian yang tersimpan, terbaru dulu. */
@Injectable()
export class FlowTransfersService {
  constructor(
    private readonly lookup: FlowLookupService,
    private readonly repository: FlowsRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getTransfers(chainId: string, rawAddress: string, query: FlowTransfersQuery = {}): Promise<FlowTransfersResponse> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = query.limit ?? DEFAULT_TRANSFER_LIMIT;
    const { chain, address, scan, failedAttempt, window } = await this.lookup.resolve(chainId, rawAddress, query);

    // Satu baris ekstra untuk tahu apakah masih ada halaman berikutnya.
    const rows =
      scan && window
        ? await this.repository.listTransfers(
            chain.id,
            address.id,
            { blockFrom: scan.blockFrom, blockTo: scan.blockTo, from: window.from, to: window.to },
            { direction: query.direction ?? null, limit: limit + 1, cursor },
          )
        : [];
    const page = rows.slice(0, limit);
    const counterpartyIds = [...new Set(page.map((row) => (row.fromId === address.id ? row.toId : row.fromId)))];
    const [addressById, labelsById, tokensById] = await Promise.all([
      this.repository.addressesByIds(counterpartyIds),
      this.repository.labelsByAddressIds(counterpartyIds),
      this.repository.tokensByIds([...new Set(page.flatMap((row) => (row.tokenId === null ? [] : [row.tokenId])))]),
    ]);
    const nativeAsset = nativeAssetOf(chain);

    const items = page.map((row): FlowTransferView => {
      const direction = row.fromId === row.toId ? 'self' : row.toId === address.id ? 'in' : 'out';
      const counterpartyId = direction === 'in' ? row.fromId : row.toId;
      const token = row.tokenId === null ? null : tokensById.get(row.tokenId);
      const asset: FlowAsset = token
        ? { type: 'token', address: token.address, symbol: token.symbol, name: token.name, decimals: token.decimals }
        : nativeAsset;
      return {
        id: `${row.source}:${row.id}`,
        direction,
        transferKind: row.source,
        counterparty: {
          address: addressById.get(counterpartyId) ?? '',
          labels: sortLabels(labelsById.get(counterpartyId) ?? []).map(toLabelView),
        },
        asset,
        amountRaw: row.amountRaw,
        amount: asset.decimals === null ? null : formatUnits(row.amountRaw, asset.decimals),
        amountUsd: numericToNumber(row.amountUsd),
        txHash: row.txHash,
        blockNumber: row.blockNumber,
        timestamp: row.timestamp.toISOString(),
        classification: 'verified_fact',
      };
    });
    const last = page.at(-1);
    const scanInfo = scan ? toScanInfo(scan, this.freshness.now(), this.freshness.staleAfterMinutes) : null;
    return {
      chain: toChainInfo(chain),
      address: address.address,
      scan: scanInfo,
      lastFailedAttempt: toFailedAttempt(failedAttempt),
      window: toWindowView(window),
      direction: query.direction ?? null,
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      dataStatus: scanInfo?.dataStatus ?? 'unavailable',
    };
  }
}
