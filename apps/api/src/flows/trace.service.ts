import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { formatUnits, numericToNumber } from '../common/units.js';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import type { ChainFamily } from '../database/schema/enums.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { effectiveStatus } from '../tokens/token-summary.mapper.js';
import type { FlowAsset } from './flow-summary.types.js';
import { FlowsRepository, type TraceEdgeRow } from './flows.repository.js';
import { searchTrace } from './trace-search.js';
import type { TraceParty, TraceResponse } from './trace.types.js';

export const DEFAULT_MAX_HOPS = 4;
export const MAX_HOPS_LIMIT = 6;

const NATIVE_DECIMALS: Partial<Record<ChainFamily, number>> = { evm: 18, solana: 9 };

export interface TraceQuery {
  maxHops?: number;
  throughHubs?: boolean;
}

/**
 * Telusur jalur dana dari satu wallet ke wallet lain lewat transfer yang
 * tersimpan, dengan urutan waktu yang masuk akal. Tidak menghubungi provider.
 */
@Injectable()
export class TraceService {
  constructor(
    private readonly repository: FlowsRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getTrace(chainId: string, rawFrom: string, rawTo: string, query: TraceQuery = {}): Promise<TraceResponse> {
    const maxHops = query.maxHops ?? DEFAULT_MAX_HOPS;
    const throughHubs = query.throughHubs ?? false;
    const chain = await this.repository.findChain(chainId);
    if (!chain) throw new NotFoundException(`Chain "${chainId}" tidak dikenal.`);

    const normalize = (raw: string) => {
      try {
        return normalizeAddress(chain.family, raw);
      } catch (error) {
        if (error instanceof InvalidIdentifierError) throw new BadRequestException(error.message);
        throw error;
      }
    };
    const fromNormalized = normalize(rawFrom);
    const toNormalized = normalize(rawTo);
    if (fromNormalized === toNormalized) throw new BadRequestException('Address asal dan tujuan tidak boleh sama.');

    const fromAddress = await this.repository.findAddress(chain.id, fromNormalized);
    if (!fromAddress) throw new NotFoundException(`Address asal ${rawFrom.trim()} belum pernah dipindai di ${chain.name}.`);
    const toAddress = await this.repository.findAddress(chain.id, toNormalized);
    const fromScan = await this.repository.findScan(chain.id, fromAddress.id);

    const result = toAddress
      ? await searchTrace(
          fromAddress.id,
          toAddress.id,
          {
            outgoing: (frontier, perAddress) => this.repository.outgoingEdges(chain.id, frontier, perAddress),
            hubs: (ids) => this.repository.hubAddressIds(ids),
          },
          { maxHops, throughHubs },
        )
      : { path: [] as TraceEdgeRow[], visited: [fromAddress.id], transfersExamined: 0, truncated: false, hubsOnPath: [], hubsSkipped: 0 };

    const pathIds = [...new Set(result.path.flatMap((edge) => [edge.fromId, edge.toId]))];
    const partyIds = [...new Set([fromAddress.id, ...(toAddress ? [toAddress.id] : []), ...pathIds])];
    const [addressById, labelsById, scanned, tokensById] = await Promise.all([
      this.repository.addressesByIds(partyIds),
      this.repository.labelsByAddressIds(partyIds),
      this.repository.scannedAddressIds(chain.id, [...new Set([...partyIds, ...result.visited])]),
      this.repository.tokensByIds([...new Set(result.path.flatMap((edge) => (edge.tokenId === null ? [] : [edge.tokenId])))]),
    ]);
    const party = (id: number, fallback: string): TraceParty => ({
      address: addressById.get(id) ?? fallback,
      labels: sortLabels(labelsById.get(id) ?? []).map(toLabelView),
      scanned: scanned.has(id),
    });

    const nativeAsset: FlowAsset = { type: 'native', symbol: chain.nativeSymbol, decimals: NATIVE_DECIMALS[chain.family] ?? null };
    const hops = result.path.map((edge, index) => {
      const token = edge.tokenId === null ? null : tokensById.get(edge.tokenId);
      const asset: FlowAsset = token
        ? { type: 'token', address: token.address, symbol: token.symbol, name: token.name, decimals: token.decimals }
        : nativeAsset;
      return {
        index,
        from: party(edge.fromId, ''),
        to: party(edge.toId, ''),
        transferKind: edge.source,
        asset,
        amountRaw: edge.amountRaw,
        amount: asset.decimals === null ? null : formatUnits(edge.amountRaw, asset.decimals),
        amountUsd: numericToNumber(edge.amountUsd),
        txHash: edge.txHash,
        blockNumber: edge.blockNumber,
        timestamp: edge.timestamp.toISOString(),
        classification: 'verified_fact' as const,
      };
    });

    const found = hops.length > 0;
    const unscannedAddresses = result.visited.filter((id) => !scanned.has(id)).length;
    const caveats: string[] = [];
    if (found) {
      caveats.push('Tiap langkah adalah transfer on-chain. Anggapan bahwa dana yang sama berpindah dari langkah ke langkah adalah dugaan.');
      for (const hubId of result.hubsOnPath) {
        const name = party(hubId, '').labels[0]?.name ?? 'sebuah hub';
        caveats.push(`Jalur melewati ${name}. Dana di sana tercampur dengan dana lain, jadi langkah sesudahnya belum tentu dana yang sama.`);
      }
    } else if (!toAddress) {
      caveats.push('Address tujuan belum muncul di transfer mana pun yang sudah dipindai.');
    } else {
      caveats.push(`Tidak ditemukan jalur dalam ${maxHops} langkah pada data yang sudah dipindai. Ini bukan bukti tidak ada hubungan.`);
    }
    if (!found && unscannedAddresses > 0) {
      caveats.push(`${unscannedAddresses} address yang dilewati belum pernah dipindai, jadi transfer keluarnya bisa belum tercatat.`);
    }
    if (!found && result.hubsSkipped > 0 && !throughHubs) {
      caveats.push(`${result.hubsSkipped} hub (exchange, router, bridge, atau pool) tidak ditelusuri lebih jauh. Pakai throughHubs=true untuk ikut menelusurinya.`);
    }
    if (result.truncated) caveats.push('Pencarian dipotong oleh batas jumlah transfer atau address, jadi bisa ada jalur yang terlewat.');

    let dataStatus = fromScan ? effectiveStatus(fromScan.status, fromScan.scannedAt, this.freshness.now(), this.freshness.staleAfterMinutes) : 'unavailable';
    if (!found && dataStatus === 'complete' && (unscannedAddresses > 0 || result.truncated)) dataStatus = 'partial';

    return {
      chain: { id: chain.id, name: chain.name, nativeSymbol: chain.nativeSymbol, explorerUrl: chain.explorerUrl, supportStatus: chain.supportStatus },
      from: party(fromAddress.id, fromAddress.address),
      to: toAddress ? party(toAddress.id, toAddress.address) : { address: rawTo.trim(), labels: [], scanned: false },
      maxHops,
      throughHubs,
      found,
      hops,
      pathClassification: 'heuristic',
      caveats,
      search: {
        addressesVisited: result.visited.length,
        transfersExamined: result.transfersExamined,
        truncated: result.truncated,
        unscannedAddresses,
        hubsSkipped: result.hubsSkipped,
      },
      dataStatus,
    };
  }
}
