import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { chainCapability, chainFamily, chainSupportStatus, type ChainCapability, type ChainFamily, type ChainSupportStatus } from '../database/schema/enums.js';
import { ChainsCatalogService } from './chains-catalog.service.js';
import type { ChainCatalogResponse, ChainDetailResponse } from './chains-catalog.types.js';

function parseEnum<T extends string>(value: string | undefined, name: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === '') return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new BadRequestException(`Parameter ${name} harus salah satu dari: ${allowed.join(', ')}.`);
  return value as T;
}

/**
 * Daftar jaringan dan bukti status dukungannya. `?family=`, `?status=`, dan
 * `?capability=` (kemampuan minimal experimental) menyaring daftar.
 */
@Controller('chains')
export class ChainsController {
  constructor(private readonly catalog: ChainsCatalogService) {}

  @Get()
  list(@Query('family') family?: string, @Query('status') status?: string, @Query('capability') capability?: string): Promise<ChainCatalogResponse> {
    return this.catalog.list({
      family: parseEnum<ChainFamily>(family, 'family', chainFamily.enumValues),
      status: parseEnum<ChainSupportStatus>(status, 'status', chainSupportStatus.enumValues),
      capability: parseEnum<ChainCapability>(capability, 'capability', chainCapability.enumValues),
    });
  }

  @Get(':chain')
  detail(@Param('chain') chain: string): Promise<ChainDetailResponse> {
    return this.catalog.detail(chain);
  }
}
