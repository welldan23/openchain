import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { parseIsoTime, parsePositiveInteger } from '../common/query-params.js';
import { entityLabelType, mapEdgeKind, type MapEdgeKind } from '../database/schema/enums.js';
import { CoordinationService } from './coordination.service.js';
import type { LabelSourceFilter, MapFilter } from './map-filter.js';
import type {
  WalletMapClustersResponse,
  WalletMapCoordinationResponse,
  WalletMapEdgeDetailResponse,
  WalletMapResponse,
} from './maps.types.js';
import { WalletClusterService } from './wallet-cluster.service.js';
import { HOLDER_LIMIT_RANGE } from './wallet-map-builder.service.js';
import { WalletMapEdgeService } from './wallet-map-edge.service.js';
import { MAX_RADIUS, WalletMapService } from './wallet-map.service.js';

/**
 * Peta Hubungan Wallet sebuah token. `?radius=` (0–5, default 2) membatasi
 * langkah dari holder, `?holders=` (1–1000, default 50) jumlah holder
 * teratas, dan `?map=` membuka peta tersimpan tertentu. Detail satu garis
 * beserta bukti transaksinya ada di `edges/:edgeId`, kelompok wallet di
 * `clusters`, dan gerak serempak di `coordination`. Filter: `hide` (jenis label utama, `none` = tanpa label),
 * `labelSource` (external/heuristic), `from`/`to` (waktu transfer), dan
 * `kinds` (funding/token_transfer). Hanya dari data tersimpan; provider tidak
 * dihubungi saat diminta.
 */
@Controller('maps')
export class MapsController {
  constructor(
    private readonly service: WalletMapService,
    private readonly edges: WalletMapEdgeService,
    private readonly clusters: WalletClusterService,
    private readonly coordination: CoordinationService,
  ) {}

  @Get(':chain/:token')
  getMap(
    @Param('chain') chain: string,
    @Param('token') token: string,
    @Query('radius') radius?: string,
    @Query('holders') holders?: string,
    @Query('map') map?: string,
    @Query('hide') hide?: string,
    @Query('labelSource') labelSource?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kinds') kinds?: string,
  ): Promise<WalletMapResponse> {
    return this.service.getMap(chain, token, {
      radius: parseRange(radius, 'radius', 0, MAX_RADIUS),
      holders: parseRange(holders, 'holders', HOLDER_LIMIT_RANGE.min, HOLDER_LIMIT_RANGE.max),
      mapId: parsePositiveInteger(map, 'map'),
      filter: parseFilter({ hide, labelSource, from, to, kinds }),
    });
  }

  @Get(':chain/:token/clusters')
  getClusters(@Param('chain') chain: string, @Param('token') token: string, @Query('map') map?: string): Promise<WalletMapClustersResponse> {
    return this.clusters.getClusters(chain, token, parsePositiveInteger(map, 'map'));
  }

  @Get(':chain/:token/coordination')
  getCoordination(
    @Param('chain') chain: string,
    @Param('token') token: string,
    @Query('map') map?: string,
  ): Promise<WalletMapCoordinationResponse> {
    return this.coordination.getCoordination(chain, token, parsePositiveInteger(map, 'map'));
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

const LABEL_KEYS = new Set<string>([...entityLabelType.enumValues, 'none']);
const EDGE_KINDS = new Set<string>(mapEdgeKind.enumValues);
const LABEL_SOURCES = new Set<string>(['all', 'external', 'heuristic']);

/** Daftar dipisah koma; nilai asing ditolak supaya salah ketik tidak diam-diam diabaikan. */
function parseList(value: string | undefined, name: string, allowed: ReadonlySet<string>): string[] {
  if (value === undefined || value.trim() === '') return [];
  const items = value.split(',').map((item) => item.trim()).filter((item) => item !== '');
  const unknown = items.filter((item) => !allowed.has(item));
  if (unknown.length > 0) {
    throw new BadRequestException(`Parameter ${name} berisi nilai yang tidak dikenal: ${unknown.join(', ')}. Pilihan: ${[...allowed].join(', ')}.`);
  }
  return items;
}

function parseFilter(raw: { hide?: string; labelSource?: string; from?: string; to?: string; kinds?: string }): MapFilter {
  const labelSource = raw.labelSource === undefined || raw.labelSource === '' ? 'all' : raw.labelSource;
  if (!LABEL_SOURCES.has(labelSource)) throw new BadRequestException('Parameter labelSource harus all, external, atau heuristic.');
  const from = parseIsoTime(raw.from, 'from');
  const to = parseIsoTime(raw.to, 'to');
  if (from && to && from > to) throw new BadRequestException('Parameter from tidak boleh sesudah to.');
  return {
    hide: new Set(parseList(raw.hide, 'hide', LABEL_KEYS)),
    labelSource: labelSource as LabelSourceFilter,
    from,
    to,
    kinds: new Set(parseList(raw.kinds, 'kinds', EDGE_KINDS) as MapEdgeKind[]),
  };
}

function parseRange(value: string | undefined, name: string, min: number, max: number): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || parsed < min || parsed > max) {
    throw new BadRequestException(`Parameter ${name} harus angka ${min} sampai ${max}.`);
  }
  return parsed;
}
