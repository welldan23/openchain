import { bigint, numeric, timestamp } from 'drizzle-orm/pg-core';

/** Id angka auto-increment (identity) untuk tabel utama. */
export const idColumn = () =>
  bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();

/** Kolom foreign key ke tabel ber-id `idColumn`. */
export const refId = (name: string) => bigint(name, { mode: 'number' });

/**
 * Jumlah token/native dalam satuan terkecil (wei, lamport). Presisi 78 digit
 * cukup untuk uint256. Disimpan sebagai string di TypeScript agar tidak
 * kehilangan presisi.
 */
export const rawAmount = (name: string) =>
  numeric(name, { precision: 78, scale: 0 });

/** Nilai USD. */
export const usdAmount = (name: string) =>
  numeric(name, { precision: 30, scale: 2 });

/** Nomor blok (EVM) atau slot (Solana). */
export const blockNumber = (name: string) => bigint(name, { mode: 'number' });

export const timestampTz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });
