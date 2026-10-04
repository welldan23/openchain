import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import type { MapsRepository } from './maps.repository.js';

/** Chain dan token dari parameter URL; 404/400 yang sama untuk semua endpoint peta. */
export async function resolveMapToken(repository: MapsRepository, chainId: string, rawToken: string) {
  const chain = await repository.findChain(chainId);
  if (!chain) throw new NotFoundException(`Chain "${chainId}" tidak dikenal.`);
  let normalized: string;
  try {
    normalized = normalizeAddress(chain.family, rawToken);
  } catch (error) {
    if (error instanceof InvalidIdentifierError) throw new BadRequestException(error.message);
    throw error;
  }
  const token = await repository.findToken(chain.id, normalized);
  if (!token) throw new NotFoundException(`Token ${rawToken.trim()} belum pernah diambil datanya di ${chain.name}.`);
  return { chain, token };
}
