import { BadRequestException } from '@nestjs/common';

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Waktu dari query string. Wajib ISO 8601 lengkap dengan zona waktu supaya
 * tidak ambigu. `undefined` bila parameter tidak diisi.
 */
export function parseIsoTime(value: string | undefined, name: string): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const date = new Date(value);
  if (!ISO_WITH_ZONE.test(value) || Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Parameter ${name} harus waktu ISO 8601 dengan zona waktu, mis. 2026-10-03T04:30:00Z.`);
  }
  return date;
}

/** Bilangan bulat positif dari query string, mis. id atau nomor blok. */
export function parsePositiveInteger(value: string | undefined, name: string, allowZero = false): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || (!allowZero && parsed === 0)) {
    throw new BadRequestException(`Parameter ${name} harus berupa ${allowZero ? 'nomor blok' : 'angka positif'} yang valid.`);
  }
  return parsed;
}
