/**
 * Validasi isi permintaan riwayat. Aturannya sama dengan frontend dan
 * constraint database, supaya kesalahan dijawab 400 yang jelas, bukan error
 * database.
 */
import { investigationKind, type InvestigationKind } from '../database/schema/enums.js';
import type { NewInvestigationInput } from './investigations.types.js';

export const NOTE_MAX_LENGTH = 280;
export const TITLE_MAX_LENGTH = 200;
const HREF = /^\/(token|flow|trace|map|multichain)\/[^\s]{1,500}$/;

export class InvestigationInputError extends Error {}

/** Catatan: kosong/spasi = hapus (`null`); selain itu maksimal 280 karakter. */
export function parseNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvestigationInputError('Catatan harus berupa teks.');
  const note = value.trim();
  if (note === '') return null;
  if (note.length > NOTE_MAX_LENGTH) throw new InvestigationInputError(`Catatan maksimal ${NOTE_MAX_LENGTH} karakter (sekarang ${note.length}).`);
  return note;
}

export function parseNewInvestigation(body: unknown): NewInvestigationInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new InvestigationInputError('Isi permintaan harus objek JSON.');
  const value = body as Record<string, unknown>;
  const kind = value.kind;
  if (typeof kind !== 'string' || !(investigationKind.enumValues as readonly string[]).includes(kind)) {
    throw new InvestigationInputError(`Jenis investigasi harus salah satu dari: ${investigationKind.enumValues.join(', ')}.`);
  }
  if (typeof value.title !== 'string' || value.title.trim() === '') throw new InvestigationInputError('Judul investigasi wajib diisi.');
  const title = value.title.trim();
  if (title.length > TITLE_MAX_LENGTH) throw new InvestigationInputError(`Judul maksimal ${TITLE_MAX_LENGTH} karakter.`);
  if (typeof value.href !== 'string' || !HREF.test(value.href)) throw new InvestigationInputError('Hanya halaman investigasi yang dicatat di riwayat.');
  if (!value.href.startsWith(`/${kind}/`)) throw new InvestigationInputError(`Tautan tidak cocok dengan jenis investigasi ${kind}.`);
  const chain = value.chain === undefined || value.chain === null ? null : value.chain;
  if (chain !== null && (typeof chain !== 'string' || !/^[a-z0-9-]+$/.test(chain))) throw new InvestigationInputError('Chain tidak valid.');
  const findingCount = value.findingCount === undefined || value.findingCount === null ? null : value.findingCount;
  if (findingCount !== null && (typeof findingCount !== 'number' || !Number.isInteger(findingCount) || findingCount < 0)) {
    throw new InvestigationInputError('Jumlah temuan harus bilangan bulat ≥ 0.');
  }
  return { kind: kind as InvestigationKind, title, chain, href: value.href, note: parseNote(value.note), findingCount };
}
