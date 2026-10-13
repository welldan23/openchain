/**
 * Bukti satu transaksi dari data tersimpan: perpindahan dananya, atau detail
 * transaksinya bila perpindahannya belum tercatat. Hash yang belum tersimpan
 * dijawab `stored: false`, tidak dikarang. Dipakai kasus dan laporan.
 */
import { formatUnits, numericToNumber } from '../common/units.js';
import { nativeAssetOf } from '../flows/flow-summary.mapper.js';
import type { FlowAsset } from '../flows/flow-summary.types.js';
import type { FlowsRepository } from '../flows/flows.repository.js';
import type { CaseEvidenceView } from './cases.types.js';

export type ChainRow = Awaited<ReturnType<FlowsRepository['listChains']>>[number];

export async function storedTxEvidence(flows: FlowsRepository, chain: ChainRow, txHash: string): Promise<CaseEvidenceView> {
  const movements = await flows.movementsByTx(chain.id, txHash);
  const transaction = movements.length === 0 ? await flows.findTransaction(chain.id, txHash) : null;
  if (movements.length === 0 && !transaction) return { chain: chain.id, txHash, stored: false, timestamp: null, blockNumber: null, movements: [] };

  const [addressById, tokensById] = await Promise.all([
    flows.addressesByIds([...new Set(movements.flatMap((move) => [move.fromId, move.toId]))]),
    flows.tokensByIds([...new Set(movements.flatMap((move) => (move.tokenId === null ? [] : [move.tokenId])))]),
  ]);
  const native = nativeAssetOf(chain);
  const first = movements[0];
  return {
    chain: chain.id,
    txHash,
    stored: true,
    timestamp: (first?.timestamp ?? transaction!.transaction.blockTimestamp).toISOString(),
    blockNumber: first?.blockNumber ?? transaction!.transaction.blockNumber,
    movements: movements.map((move) => {
      const token = move.tokenId === null ? null : tokensById.get(move.tokenId);
      const asset: FlowAsset = token ? { type: 'token', address: token.address, symbol: token.symbol, name: token.name, decimals: token.decimals } : native;
      return {
        from: addressById.get(move.fromId) ?? '',
        to: addressById.get(move.toId) ?? '',
        asset,
        amountRaw: move.amountRaw,
        amount: asset.decimals === null ? null : formatUnits(move.amountRaw, asset.decimals),
        amountUsd: numericToNumber(move.amountUsd),
      };
    }),
  };
}
