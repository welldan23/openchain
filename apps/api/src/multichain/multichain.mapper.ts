/** Bentuk respons aktivitas dan bridge lintas chain, dipakai profil dan endpoint bukti. */
import { formatUnits, numericToNumber } from '../common/units.js';
import type { chains } from '../database/schema/index.js';
import { nativeAssetOf } from '../flows/flow-summary.mapper.js';
import type { FlowAsset } from '../flows/flow-summary.types.js';
import type { FlowsRepository } from '../flows/flows.repository.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import type { ActivityRow, MultichainRepository } from './multichain.repository.js';
import type { BridgeMoveView, CrossChainActivityView } from './multichain.types.js';

type ChainRow = typeof chains.$inferSelect;
type BridgeRow = Awaited<ReturnType<MultichainRepository['bridgeTransfersFor']>>[number];

export function toActivityView(
  row: ActivityRow,
  chain: ChainRow,
  addressById: Map<number, string>,
  labelsById: Awaited<ReturnType<FlowsRepository['labelsByAddressIds']>>,
  bridgeIds: Set<number>,
  tokensById: Awaited<ReturnType<FlowsRepository['tokensByIds']>>,
  bridgeOfTransfer: Map<string, number>,
): CrossChainActivityView {
  const token = row.tokenId === null ? undefined : tokensById.get(row.tokenId);
  const asset: FlowAsset = token
    ? { type: 'token', address: token.address, symbol: token.symbol, name: token.name, decimals: token.decimals }
    : nativeAssetOf(chain);
  const viaBridge = bridgeIds.has(row.counterpartyId);
  const kind = row.direction === 'self' ? 'self' : viaBridge ? (row.direction === 'out' ? 'bridge_out' : 'bridge_in') : row.direction;
  const table = row.source === 'token' ? 'token' : 'native';
  return {
    id: `${row.chainId}:${table}:${row.id}`,
    chain: row.chainId,
    kind,
    timestamp: row.timestamp.toISOString(),
    blockNumber: row.blockNumber,
    counterparty: addressById.get(row.counterpartyId) ?? '',
    counterpartyLabels: sortLabels(labelsById.get(row.counterpartyId) ?? []).map(toLabelView),
    transferKind: row.source,
    asset,
    amountRaw: row.amountRaw,
    amount: asset.decimals === null ? null : formatUnits(row.amountRaw, asset.decimals),
    amountUsd: numericToNumber(row.amountUsd),
    txHash: row.txHash,
    bridgeId: bridgeOfTransfer.get(`${table}:${row.id}`) ?? null,
    classification: 'verified_fact',
  };
}

/** Kunci transfer kaki-kaki bridge → id bridge, untuk menandai linimasa. */
export function bridgeOfTransfers(rows: readonly BridgeRow[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    for (const [table, id] of [
      ['native', row.sentNativeTransferId],
      ['token', row.sentTokenTransferId],
      ['native', row.receivedNativeTransferId],
      ['token', row.receivedTokenTransferId],
    ] as const) {
      if (id !== null) result.set(`${table}:${id}`, row.id);
    }
  }
  return result;
}

export async function bridgeViews(
  rows: readonly BridgeRow[],
  chainById: Map<string, ChainRow>,
  repository: MultichainRepository,
  flows: FlowsRepository,
): Promise<BridgeMoveView[]> {
  if (rows.length === 0) return [];
  const nativeIds = rows.flatMap((row) => [row.sentNativeTransferId, row.receivedNativeTransferId]).filter((id): id is number => id !== null);
  const tokenIds = rows.flatMap((row) => [row.sentTokenTransferId, row.receivedTokenTransferId]).filter((id): id is number => id !== null);
  const [hashes, bridgeAddresses] = await Promise.all([
    repository.transferHashes(nativeIds, tokenIds),
    flows.addressesByIds(rows.map((row) => row.bridgeAddressId)),
  ]);
  const hashOf = (native: number | null, token: number | null) =>
    native !== null ? (hashes.get(`native:${native}`) ?? null) : token !== null ? (hashes.get(`token:${token}`) ?? null) : null;
  return rows
    .filter((row) => chainById.has(row.sourceChainId) && (row.destChainId === null || chainById.has(row.destChainId)))
    .map((row) => ({
      id: row.id,
      fromChain: row.sourceChainId,
      toChain: row.destChainId,
      protocolId: row.protocolId,
      bridgeAddress: bridgeAddresses.get(row.bridgeAddressId) ?? '',
      status: row.status,
      amountSentRaw: row.amountSentRaw,
      amountReceivedRaw: row.amountReceivedRaw,
      amountUsd: numericToNumber(row.amountUsd),
      sentTxHash: hashOf(row.sentNativeTransferId, row.sentTokenTransferId) ?? '',
      sentAt: row.sentAt.toISOString(),
      receivedTxHash: hashOf(row.receivedNativeTransferId, row.receivedTokenTransferId),
      receivedAt: row.receivedAt?.toISOString() ?? null,
      matchClassification: 'heuristic',
      matchConfidence: row.matchConfidence,
      matchReason: row.matchReason,
    }));
}
