import type { DataStatus } from '../database/schema/enums.js';

/**
 * Status data snapshot dari status setiap provider yang membentuknya:
 * - tanpa provider, atau semua provider gagal → `unavailable`
 * - ada provider yang gagal atau datanya sebagian → `partial`
 * - ada provider yang memakai data lama → `stale`
 * - semua lengkap → `complete`
 */
export function deriveSnapshotStatus(providerStatuses: DataStatus[]): DataStatus {
  if (providerStatuses.length === 0) return 'unavailable';
  if (providerStatuses.every((status) => status === 'unavailable')) return 'unavailable';
  if (providerStatuses.some((status) => status === 'partial' || status === 'unavailable')) return 'partial';
  if (providerStatuses.some((status) => status === 'stale')) return 'stale';
  return 'complete';
}
