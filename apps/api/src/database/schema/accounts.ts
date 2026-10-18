/**
 * Akun pengguna dan sesi masuk. Kata sandi hanya disimpan sebagai hash scrypt
 * (dijaga constraint, jadi kata sandi mentah ditolak database). Token sesi
 * hanya disimpan hash SHA-256-nya; token mentah hanya dipegang browser.
 * Tidak ada private key, seed phrase, atau koneksi wallet.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { idColumn, refId, timestampTz } from './columns.js';

/** Format hash kata sandi: `scrypt$N$r$p$garam$hash` (base64url). */
export const PASSWORD_HASH_PATTERN = '^scrypt\\$[0-9]+\\$[0-9]+\\$[0-9]+\\$[A-Za-z0-9_-]{16,}\\$[A-Za-z0-9_-]{32,}$';

export const users = pgTable(
  'users',
  {
    id: idColumn(),
    /** Email seperti yang diketik pengguna. */
    email: text('email').notNull(),
    /** Email huruf kecil tanpa spasi tepi; unik supaya satu email satu akun. */
    emailNormalized: text('email_normalized').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** Zona waktu IANA untuk menampilkan waktu, mis. `Asia/Jakarta`. */
    timezone: text('timezone').notNull().default('Asia/Jakarta'),
    /** Percobaan masuk gagal berturut-turut; direset saat berhasil masuk. */
    failedSignIns: integer('failed_sign_ins').notNull().default(0),
    /** Masuk ditolak sampai waktu ini setelah terlalu banyak gagal. */
    lockedUntil: timestampTz('locked_until'),
    lastSignInAt: timestampTz('last_sign_in_at'),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (t) => [
    unique('users_email_unique').on(t.emailNormalized),
    check('users_email_normalized', sql`${t.emailNormalized} = lower(btrim(${t.email}))`),
    check('users_email_format', sql`length(${t.email}) <= 254 and ${t.emailNormalized} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]{2,}$'`),
    check('users_display_name_length', sql`length(btrim(${t.displayName})) between 2 and 60 and ${t.displayName} = btrim(${t.displayName})`),
    // Kata sandi mentah atau hash format lain ditolak.
    check('users_password_is_hash', sql`${t.passwordHash} ~ ${sql.raw(`'${PASSWORD_HASH_PATTERN}'`)}`),
    check('users_timezone_length', sql`length(${t.timezone}) between 1 and 64`),
    check('users_failed_sign_ins', sql`${t.failedSignIns} >= 0`),
    check('users_updated_order', sql`${t.createdAt} <= ${t.updatedAt}`),
  ],
);

/** Sesi masuk: satu baris per perangkat/browser. */
export const userSessions = pgTable(
  'user_sessions',
  {
    id: idColumn(),
    userId: refId('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 heksadesimal dari token sesi. */
    tokenHash: text('token_hash').notNull(),
    createdAt: timestampTz('created_at').notNull(),
    expiresAt: timestampTz('expires_at').notNull(),
    lastSeenAt: timestampTz('last_seen_at').notNull(),
    /** Diisi saat keluar atau sesi dicabut. */
    revokedAt: timestampTz('revoked_at'),
  },
  (t) => [
    unique('user_sessions_token_unique').on(t.tokenHash),
    index('user_sessions_user_idx').on(t.userId),
    check('user_sessions_hash_format', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('user_sessions_expiry_order', sql`${t.expiresAt} > ${t.createdAt}`),
    check('user_sessions_seen_order', sql`${t.lastSeenAt} >= ${t.createdAt}`),
    check('user_sessions_revoked_order', sql`${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt}`),
  ],
);
