/**
 * Membentuk dan menyimpan satu Peta Hubungan Wallet untuk sebuah token.
 *
 * Dasar peta adalah snapshot holder (terbaru, atau pada blok tertentu); semua
 * transfer yang dipakai dibatasi sampai blok snapshot itu, jadi peta yang
 * sama bisa dibentuk ulang dengan hasil yang sama. Peta hanya dibaca dari
 * data yang sudah tersimpan: service ini tidak memanggil provider dan tidak
 * mengarang hubungan yang belum ada buktinya.
 */
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { normalizeAddress } from '../database/identifiers.js';
import { mapEdges, mapNodes, walletMaps } from '../database/schema/index.js';
import { buildMapGraph, type MapGraph, type MapGraphOptions } from './map-graph.js';
import { MapsRepository } from './maps.repository.js';

const CHUNK = 500;

export const HOLDER_LIMIT_RANGE = { min: 1, max: 1_000 } as const;
export const FUNDING_DEPTH_RANGE = { min: 0, max: 5 } as const;

/** Peta belum bisa dibentuk; pesan aman ditampilkan. */
export class MapBuildError extends Error {
  constructor(
    readonly code: 'chain_not_found' | 'token_not_found' | 'snapshot_not_found' | 'invalid_option',
    message: string,
  ) {
    super(message);
    this.name = 'MapBuildError';
  }
}

export interface WalletMapBuildRequest {
  chainId: string;
  tokenAddress: string;
  /** Holder teratas yang dipetakan. */
  holderLimit?: number;
  /** Lapis pendana yang ditelusuri. */
  fundingDepth?: number;
  /** Blok snapshot dasar; kosong = snapshot terbaru. */
  snapshotBlock?: number;
  limits?: Omit<MapGraphOptions, 'fundingDepth'>;
}

export interface WalletMapBuildResult {
  mapId: number;
  chainId: string;
  tokenId: number;
  snapshotId: number;
  blockNumber: number;
  holderLimit: number;
  fundingDepth: number;
  builtAt: Date;
  graph: MapGraph;
}

export const WALLET_MAP_DEFAULTS = { holderLimit: 50, fundingDepth: 2 } as const;

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK) result.push(items.slice(start, start + CHUNK));
  return result;
}

function checkRange(name: string, value: number, range: { min: number; max: number }): void {
  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    throw new MapBuildError('invalid_option', `${name} harus bilangan bulat ${range.min}–${range.max}.`);
  }
}

@Injectable()
export class WalletMapBuilder {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: MapsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async build(request: WalletMapBuildRequest): Promise<WalletMapBuildResult> {
    const holderLimit = request.holderLimit ?? WALLET_MAP_DEFAULTS.holderLimit;
    const fundingDepth = request.fundingDepth ?? WALLET_MAP_DEFAULTS.fundingDepth;
    checkRange('Jumlah holder', holderLimit, HOLDER_LIMIT_RANGE);
    checkRange('Kedalaman pendanaan', fundingDepth, FUNDING_DEPTH_RANGE);

    const chain = await this.repository.findChain(request.chainId);
    if (!chain) throw new MapBuildError('chain_not_found', `Chain ${request.chainId} tidak dikenal.`);
    // Address tidak valid dilempar sebagai InvalidIdentifierError.
    const normalized = normalizeAddress(chain.family, request.tokenAddress);
    const token = await this.repository.findToken(chain.id, normalized);
    if (!token) throw new MapBuildError('token_not_found', `Token ${request.tokenAddress} belum pernah diambil datanya di ${chain.id}.`);
    const snapshot = await this.repository.findSnapshot(token.id, request.snapshotBlock);
    if (!snapshot) {
      throw new MapBuildError(
        'snapshot_not_found',
        request.snapshotBlock === undefined
          ? `Belum ada snapshot holder untuk token ini; ambil data token dulu.`
          : `Tidak ada snapshot token ini pada blok ${request.snapshotBlock}.`,
      );
    }

    const holders = await this.repository.findHolders(snapshot.id, holderLimit);
    const graph = await buildMapGraph(holders, this.repository.loader(chain.id, token.id, snapshot.blockNumber), {
      ...request.limits,
      fundingDepth,
    });
    const builtAt = this.clock.now();

    const mapId = await this.db.transaction(async (tx) => {
      const [map] = await tx
        .insert(walletMaps)
        .values({
          chainId: chain.id,
          tokenId: token.id,
          snapshotId: snapshot.id,
          blockNumber: snapshot.blockNumber,
          holderLimit,
          fundingDepth,
          status: graph.status,
          statusReason: graph.statusReason,
          missingFields: graph.missingFields,
          builtAt,
        })
        .returning({ id: walletMaps.id });
      const nodeIds = new Map<number, number>();
      for (const batch of chunks(graph.nodes)) {
        const rows = await tx
          .insert(mapNodes)
          .values(
            batch.map((node) => ({
              mapId: map.id,
              chainId: chain.id,
              addressId: node.addressId,
              role: node.role,
              sharePct: node.sharePct,
              isContract: node.isContract,
            })),
          )
          .returning({ id: mapNodes.id, addressId: mapNodes.addressId });
        for (const row of rows) nodeIds.set(row.addressId, row.id);
      }
      const nodeId = (addressId: number) => {
        const id = nodeIds.get(addressId);
        if (id === undefined) throw new Error(`Node untuk address #${addressId} tidak ada di peta`);
        return id;
      };
      for (const batch of chunks(graph.edges)) {
        await tx.insert(mapEdges).values(
          batch.map((edge) => ({
            mapId: map.id,
            fromNodeId: nodeId(edge.fromId),
            toNodeId: nodeId(edge.toId),
            kind: edge.kind,
            nativeTransferId: edge.nativeTransferId,
            tokenTransferId: edge.tokenTransferId,
          })),
        );
      }
      return map.id;
    });

    return {
      mapId,
      chainId: chain.id,
      tokenId: token.id,
      snapshotId: snapshot.id,
      blockNumber: snapshot.blockNumber,
      holderLimit,
      fundingDepth,
      builtAt,
      graph,
    };
  }
}
