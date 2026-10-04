import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { parseIsoTime, parsePositiveInteger } from '../common/query-params.js';
import { COMPARISON_KEYS, type ComparisonKey } from './multichain-comparison.js';
import type { MultichainComparisonResponse, MultichainProfileResponse } from './multichain.types.js';
import { MAX_ACTIVITY_LIMIT, MultichainService } from './multichain.service.js';

/**
 * Aktivitas satu address EVM di semua chain EVM. `?chains=` (dipisah koma),
 * `?from=`/`?to=` (waktu ISO), `?limit=` (linimasa, 1–500), dan `?scan=`
 * (ringkasan tersimpan). `compare` memberi tabel perbandingan antar chain
 * (`?sort=` dan `?direction=`). Hanya dari data tersimpan.
 */
@Controller('multichain')
export class MultichainController {
  constructor(private readonly service: MultichainService) {}

  @Get(':address/compare')
  compare(
    @Param('address') address: string,
    @Query('chains') chains?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('scan') scan?: string,
    @Query('sort') sort?: string,
    @Query('direction') direction?: string,
  ): Promise<MultichainComparisonResponse> {
    const key = (sort ?? 'txCount') as ComparisonKey;
    if (!(COMPARISON_KEYS as readonly string[]).includes(key)) throw new BadRequestException(`Parameter sort harus salah satu dari: ${COMPARISON_KEYS.join(', ')}.`);
    const order = direction ?? (key === 'chain' ? 'asc' : 'desc');
    if (order !== 'asc' && order !== 'desc') throw new BadRequestException('Parameter direction harus asc atau desc.');
    return this.service.compare(
      address,
      {
        chains: parseChains(chains),
        from: parseIsoTime(from, 'from'),
        to: parseIsoTime(to, 'to'),
        scanId: parsePositiveInteger(scan, 'scan'),
      },
      key,
      order,
    );
  }

  @Get(':address')
  getProfile(
    @Param('address') address: string,
    @Query('chains') chains?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('scan') scan?: string,
  ): Promise<MultichainProfileResponse> {
    const parsedLimit = parsePositiveInteger(limit, 'limit');
    if (parsedLimit !== undefined && parsedLimit > MAX_ACTIVITY_LIMIT) throw new BadRequestException(`Parameter limit maksimal ${MAX_ACTIVITY_LIMIT}.`);
    return this.service.getProfile(address, {
      chains: parseChains(chains),
      from: parseIsoTime(from, 'from'),
      to: parseIsoTime(to, 'to'),
      limit: parsedLimit,
      scanId: parsePositiveInteger(scan, 'scan'),
    });
  }
}

function parseChains(value: string | undefined): string[] | undefined {
  return value ? value.split(',').map((item) => item.trim()).filter((item) => item !== '') : undefined;
}
