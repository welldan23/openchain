/** Mengubah baris peta tersimpan menjadi bentuk respons API. */
import { formatUnits, numericToNumber } from '../common/units.js';
import type { chains, labels } from '../database/schema/index.js';
import { movementKey, nativeAssetOf } from '../flows/flow-summary.mapper.js';
import type { FlowAsset } from '../flows/flow-summary.types.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import type { MapEdgeRow, MapsRepository } from './maps.repository.js';
import type { WalletMapEdgeView, WalletMapPartyView } from './maps.types.js';

type ChainRow = typeof chains.$inferSelect;
type LabelRow = typeof labels.$inferSelect;
type NodeRow = Awaited<ReturnType<MapsRepository['mapNodes']>>[number];
type TokenMeta = { address: string; symbol: string | null; name: string | null; decimals: number | null };

export function toPartyView(node: NodeRow, labelRows: LabelRow[]): WalletMapPartyView {
  return {
    address: node.address,
    role: node.role,
    sharePct: numericToNumber(node.sharePct) ?? 0,
    isContract: node.isContract,
    labels: sortLabels(labelRows).map(toLabelView),
  };
}

export function toEdgeView(
  edge: MapEdgeRow,
  chain: ChainRow,
  addressOf: ReadonlyMap<number, string>,
  tokensById: ReadonlyMap<number, TokenMeta>,
): WalletMapEdgeView {
  const tokenMeta = edge.tokenId === null ? null : tokensById.get(edge.tokenId);
  const asset: FlowAsset = tokenMeta
    ? { type: 'token', address: tokenMeta.address, symbol: tokenMeta.symbol, name: tokenMeta.name, decimals: tokenMeta.decimals }
    : nativeAssetOf(chain);
  return {
    id: movementKey(edge.source, edge.transferId),
    kind: edge.kind,
    from: addressOf.get(edge.fromNodeId) ?? '',
    to: addressOf.get(edge.toNodeId) ?? '',
    transferKind: edge.source,
    asset,
    amountRaw: edge.amountRaw,
    amount: asset.decimals === null ? null : formatUnits(edge.amountRaw, asset.decimals),
    amountUsd: numericToNumber(edge.amountUsd),
    txHash: edge.txHash,
    blockNumber: edge.blockNumber,
    timestamp: edge.timestamp.toISOString(),
    classification: 'verified_fact',
  };
}

/** Token yang dipakai garis-garis ini, supaya metadatanya diambil sekali. */
export function tokenIdsOf(edges: readonly MapEdgeRow[]): number[] {
  return [...new Set(edges.flatMap((edge) => (edge.tokenId === null ? [] : [edge.tokenId])))];
}
