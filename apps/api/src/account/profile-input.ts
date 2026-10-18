/**
 * Validasi ubah profil dan foto, murni. Jenis foto ditentukan dari isi
 * berkasnya (magic bytes), bukan dari Content-Type kiriman browser; SVG dan
 * format lain ditolak.
 */
import { AVATAR_MAX_BYTES } from '../database/schema/accounts.js';

export const NAME_MIN = 2;
export const NAME_MAX = 60;

export class ProfileInputError extends Error {}

export interface ProfileUpdate {
  displayName?: string;
  timezone?: string;
}

export type AvatarType = 'image/png' | 'image/jpeg' | 'image/webp';

const TIME_ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

export function isTimeZone(value: string): boolean {
  return TIME_ZONES.has(value);
}

export function parseProfileUpdate(value: unknown): ProfileUpdate {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ProfileInputError('Isi permintaan harus objek JSON.');
  const body = value as Record<string, unknown>;
  const update: ProfileUpdate = {};
  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string') throw new ProfileInputError('Nama tampilan harus berupa teks.');
    const name = body.displayName.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) throw new ProfileInputError(`Nama tampilan ${NAME_MIN}–${NAME_MAX} karakter.`);
    update.displayName = name;
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || !isTimeZone(body.timezone)) throw new ProfileInputError('Zona waktu tidak dikenal. Pakai nama IANA, mis. Asia/Jakarta.');
    update.timezone = body.timezone;
  }
  if (Object.keys(update).length === 0) throw new ProfileInputError('Tidak ada yang diubah.');
  return update;
}

/** Jenis gambar dari tanda tangan isinya; `null` bila bukan PNG, JPEG, atau WebP. */
export function detectImageType(data: Buffer): AvatarType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function validateAvatar(data: Buffer | undefined): { data: Buffer; contentType: AvatarType } {
  if (!data || data.length === 0) throw new ProfileInputError('Pilih berkas foto di kolom "avatar".');
  if (data.length > AVATAR_MAX_BYTES) throw new ProfileInputError('Ukuran foto maksimal 2 MB.');
  const contentType = detectImageType(data);
  if (!contentType) throw new ProfileInputError('Foto harus berformat PNG, JPG, atau WebP.');
  return { data, contentType };
}
