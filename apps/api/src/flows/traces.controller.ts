import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { DEFAULT_MAX_HOPS, MAX_HOPS_LIMIT, TraceService } from './trace.service.js';
import type { TraceResponse } from './trace.types.js';

/**
 * Telusur jalur dana antar wallet. Read-only, hanya dari transfer yang
 * tersimpan. `?maxHops=` (1–6, default 4) membatasi langkah, dan
 * `?throughHubs=true` ikut menelusuri lewat exchange/router/bridge/pool.
 */
@Controller('traces')
export class TracesController {
  constructor(private readonly traceService: TraceService) {}

  @Get(':chain/:from/:to')
  getTrace(
    @Param('chain') chain: string,
    @Param('from') from: string,
    @Param('to') to: string,
    @Query('maxHops') maxHops?: string,
    @Query('throughHubs') throughHubs?: string,
  ): Promise<TraceResponse> {
    return this.traceService.getTrace(chain, from, to, {
      maxHops: parseMaxHops(maxHops),
      throughHubs: parseBoolean(throughHubs, 'throughHubs'),
    });
  }
}

function parseMaxHops(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_MAX_HOPS;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || parsed < 1 || parsed > MAX_HOPS_LIMIT) {
    throw new BadRequestException(`Parameter maxHops harus angka 1 sampai ${MAX_HOPS_LIMIT}.`);
  }
  return parsed;
}

function parseBoolean(value: string | undefined, name: string): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new BadRequestException(`Parameter ${name} harus true atau false.`);
}
