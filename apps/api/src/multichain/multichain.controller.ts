import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { parseIsoTime, parsePositiveInteger } from '../common/query-params.js';
import type { MultichainProfileResponse } from './multichain.types.js';
import { MAX_ACTIVITY_LIMIT, MultichainService } from './multichain.service.js';

/**
 * Aktivitas satu address EVM di semua chain EVM. `?chains=` (dipisah koma),
 * `?from=`/`?to=` (waktu ISO), `?limit=` (linimasa, 1–500), dan `?scan=`
 * (ringkasan tersimpan). Hanya dari data tersimpan.
 */
@Controller('multichain')
export class MultichainController {
  constructor(private readonly service: MultichainService) {}

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
      chains: chains ? chains.split(',').map((item) => item.trim()).filter((item) => item !== '') : undefined,
      from: parseIsoTime(from, 'from'),
      to: parseIsoTime(to, 'to'),
      limit: parsedLimit,
      scanId: parsePositiveInteger(scan, 'scan'),
    });
  }
}
