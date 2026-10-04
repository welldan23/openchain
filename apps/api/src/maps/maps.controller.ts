import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { parsePositiveInteger } from '../common/query-params.js';
import type { WalletMapClustersResponse, WalletMapEdgeDetailResponse, WalletMapResponse } from './maps.types.js';
import { WalletClusterService } from './wallet-cluster.service.js';
import { HOLDER_LIMIT_RANGE } from './wallet-map-builder.service.js';
import { WalletMapEdgeService } from './wallet-map-edge.service.js';
import { MAX_RADIUS, WalletMapService } from './wallet-map.service.js';

/**
 * Peta Hubungan Wallet sebuah token. `?radius=` (0–5, default 2) membatasi
 * langkah dari holder, `?holders=` (1–1000, default 50) jumlah holder
 * teratas, dan `?map=` membuka peta tersimpan tertentu. Detail satu garis
 * beserta bukti transaksinya ada di `edges/:edgeId`, kelompok wallet di
 * `clusters`. Hanya dari data tersimpan; provider tidak dihubungi saat diminta.
 */
@Controller('maps')
export class MapsController {
  constructor(
    private readonly service: WalletMapService,
    private readonly edges: WalletMapEdgeService,
    private readonly clusters: WalletClusterService,
  ) {}

  @Get(':chain/:token')
  getMap(
    @Param('chain') chain: string,
    @Param('token') token: string,
    @Query('radius') radius?: string,
    @Query('holders') holders?: string,
    @Query('map') map?: string,
  ): Promise<WalletMapResponse> {
    return this.service.getMap(chain, token, {
      radius: parseRange(radius, 'radius', 0, MAX_RADIUS),
      holders: parseRange(holders, 'holders', HOLDER_LIMIT_RANGE.min, HOLDER_LIMIT_RANGE.max),
      mapId: parsePositiveInteger(map, 'map'),
    });
  }

  @Get(':chain/:token/clusters')
  getClusters(@Param('chain') chain: string, @Param('token') token: string, @Query('map') map?: string): Promise<WalletMapClustersResponse> {
    return this.clusters.getClusters(chain, token, parsePositiveInteger(map, 'map'));
  }

  @Get(':chain/:token/edges/:edgeId')
  getEdge(
    @Param('chain') chain: string,
    @Param('token') token: string,
    @Param('edgeId') edgeId: string,
    @Query('map') map?: string,
  ): Promise<WalletMapEdgeDetailResponse> {
    return this.edges.getEdge(chain, token, edgeId, parsePositiveInteger(map, 'map'));
  }
}

function parseRange(value: string | undefined, name: string, min: number, max: number): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || parsed < min || parsed > max) {
    throw new BadRequestException(`Parameter ${name} harus angka ${min} sampai ${max}.`);
  }
  return parsed;
}
