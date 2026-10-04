import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { chainCapability, chainFamily, chainSupportStatus, type ChainCapability, type ChainFamily, type ChainSupportStatus } from '../database/schema/enums.js';
import { ChainsCatalogService, DEFAULT_AVAILABILITY_HOURS, MAX_AVAILABILITY_HOURS } from './chains-catalog.service.js';
import type { ChainAvailabilityResponse, ChainCatalogResponse, ChainDetailResponse } from './chains-catalog.types.js';

function parseEnum<T extends string>(value: string | undefined, name: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === '') return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new BadRequestException(`Parameter ${name} harus salah satu dari: ${allowed.join(', ')}.`);
  return value as T;
}

/**
 * Daftar jaringan dan bukti status dukungannya. `?family=`, `?status=`, dan
 * `?capability=` (kemampuan minimal experimental) menyaring daftar.
 * `availability` memberi kesehatan sumber data tiap chain (`?hours=`, 1–168).
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

  @Get('availability')
  availability(@Query('hours') hours?: string): Promise<ChainAvailabilityResponse> {
    let parsed = DEFAULT_AVAILABILITY_HOURS;
    if (hours !== undefined && hours !== '') {
      parsed = Number(hours);
      if (!/^\d+$/.test(hours) || parsed < 1 || parsed > MAX_AVAILABILITY_HOURS) {
        throw new BadRequestException(`Parameter hours harus angka 1 sampai ${MAX_AVAILABILITY_HOURS}.`);
      }
    }
    return this.catalog.availability(parsed);
  }

  @Get(':chain')
  detail(@Param('chain') chain: string): Promise<ChainDetailResponse> {
    return this.catalog.detail(chain);
  }
}
