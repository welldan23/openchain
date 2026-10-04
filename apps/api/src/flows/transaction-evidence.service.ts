import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { formatUnits, numericToNumber } from '../common/units.js';
import { InvalidIdentifierError, normalizeTxHash } from '../database/identifiers.js';
import { explorerEvidenceUrl, toEvidenceView } from '../tokens/evidence.view.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import { movementKey, nativeAssetOf, toChainInfo, toMovementType } from './flow-summary.mapper.js';
import type { FlowAsset } from './flow-summary.types.js';
import { FlowsRepository } from './flows.repository.js';
import type { TransactionEvidenceResponse, TxParty } from './transaction-evidence.types.js';

/**
 * Bukti satu transaksi dari data yang tersimpan: semua perpindahan dananya,
 * detail transaksi bila ada, dan klaim yang memakainya. Tidak menghubungi
 * provider; transaksi yang belum tercatat dijawab 404, tidak dikarang.
 */
@Injectable()
export class TransactionEvidenceService {
  constructor(private readonly repository: FlowsRepository) {}

  async getEvidence(chainId: string, rawHash: string): Promise<TransactionEvidenceResponse> {
    const chain = await this.repository.findChain(chainId);
    if (!chain) throw new NotFoundException(`Chain "${chainId}" tidak dikenal.`);
    let txHash: string;
    try {
      txHash = normalizeTxHash(chain.family, rawHash);
    } catch (error) {
      if (error instanceof InvalidIdentifierError) throw new BadRequestException(error.message);
      throw error;
    }

    const [movements, transaction, claims] = await Promise.all([
      this.repository.movementsByTx(chain.id, txHash),
      this.repository.findTransaction(chain.id, txHash),
      this.repository.evidenceByTx(chain.id, txHash),
    ]);
    if (movements.length === 0 && !transaction) {
      throw new NotFoundException(`Transaksi ${rawHash.trim()} belum tercatat di data ${chain.name} yang sudah dipindai.`);
    }

    const partyIds = [...new Set(movements.flatMap((move) => [move.fromId, move.toId]))];
    const [addressById, labelsById, tokensById, runs, movementTypes] = await Promise.all([
      this.repository.addressesByIds(partyIds),
      this.repository.labelsByAddressIds(partyIds),
      this.repository.tokensByIds([...new Set(movements.flatMap((move) => (move.tokenId === null ? [] : [move.tokenId])))]),
      this.repository.providerRunsByIds([...new Set(movements.flatMap((move) => (move.providerRunId === null ? [] : [move.providerRunId])))]),
      this.repository.movementTypesFor(movements),
    ]);
    const party = (id: number): TxParty => ({
      address: addressById.get(id) ?? '',
      labels: sortLabels(labelsById.get(id) ?? []).map(toLabelView),
    });
    const nativeAsset = nativeAssetOf(chain);
    const first = movements[0];
    const tx = transaction?.transaction ?? null;

    return {
      chain: toChainInfo(chain),
      txHash,
      explorerUrl: explorerEvidenceUrl(chain, { txHash, blockNumber: null }),
      blockNumber: first?.blockNumber ?? tx!.blockNumber,
      timestamp: (first?.timestamp ?? tx!.blockTimestamp).toISOString(),
      transaction: tx
        ? { from: transaction?.from ?? null, to: transaction?.to ?? null, method: tx.method, success: tx.success, valueRaw: tx.valueRaw }
        : null,
      movements: movements.map((move, index) => {
        const token = move.tokenId === null ? null : tokensById.get(move.tokenId);
        const asset: FlowAsset = token
          ? { type: 'token', address: token.address, symbol: token.symbol, name: token.name, decimals: token.decimals }
          : nativeAsset;
        return {
          index,
          transferKind: move.source,
          position: move.position,
          from: party(move.fromId),
          to: party(move.toId),
          asset,
          amountRaw: move.amountRaw,
          amount: asset.decimals === null ? null : formatUnits(move.amountRaw, asset.decimals),
          amountUsd: numericToNumber(move.amountUsd),
          classification: 'verified_fact' as const,
          movement: toMovementType(movementTypes.get(movementKey(move.source, move.id))),
        };
      }),
      claims: claims.map((record) => toEvidenceView(record, chain)),
      sources: runs.map((run) => ({ provider: run.provider, operation: run.operation, status: run.status, fetchedAt: run.fetchedAt?.toISOString() ?? null })),
    };
  }
}
