/**
 * Akun pengguna, profilnya, dan sesi masuk. `users` hanya identitas dan
 * kredensial; cara pengguna tampil (nama, zona waktu, foto) ada di
 * `user_profiles`. Kata sandi hanya disimpan sebagai hash scrypt
 * (dijaga constraint, jadi kata sandi mentah ditolak database). Token sesi
 * hanya disimpan hash SHA-256-nya; token mentah hanya dipegang browser.
 * Tidak ada private key, seed phrase, atau koneksi wallet.
 */
import { sql } from 'drizzle-orm';
import { check, customType, index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
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
    passwordHash: text('password_hash').notNull(),
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
    // Kata sandi mentah atau hash format lain ditolak.
    check('users_password_is_hash', sql`${t.passwordHash} ~ ${sql.raw(`'${PASSWORD_HASH_PATTERN}'`)}`),
    check('users_failed_sign_ins', sql`${t.failedSignIns} >= 0`),
    check('users_updated_order', sql`${t.createdAt} <= ${t.updatedAt}`),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Profil pengguna: satu baris per akun. Foto disimpan di database (maks.
 * 2 MB) supaya tidak perlu penyimpanan berkas terpisah; kolom foto terisi
 * semua atau kosong semua, dan ukurannya harus sama dengan isinya.
 */
export const userProfiles = pgTable(
  'user_profiles',
  {
    userId: refId('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    /** Zona waktu IANA untuk menampilkan waktu, mis. `Asia/Jakarta`. */
    timezone: text('timezone').notNull().default('Asia/Jakarta'),
    avatarData: bytea('avatar_data'),
    avatarContentType: text('avatar_content_type'),
    avatarSize: integer('avatar_size'),
    /** SHA-256 heksadesimal isi foto, untuk ETag dan mencegah simpan ulang yang sama. */
    avatarSha256: text('avatar_sha256'),
    avatarUpdatedAt: timestampTz('avatar_updated_at'),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (t) => [
    check('user_profiles_display_name_length', sql`length(btrim(${t.displayName})) between 2 and 60 and ${t.displayName} = btrim(${t.displayName})`),
    check('user_profiles_timezone_length', sql`length(${t.timezone}) between 1 and 64`),
    check(
      'user_profiles_avatar_complete',
      sql`(${t.avatarData} is null) = (${t.avatarContentType} is null) and (${t.avatarData} is null) = (${t.avatarSize} is null) and (${t.avatarData} is null) = (${t.avatarSha256} is null) and (${t.avatarData} is null) = (${t.avatarUpdatedAt} is null)`,
    ),
    check('user_profiles_avatar_type', sql`${t.avatarContentType} is null or ${t.avatarContentType} in ('image/png', 'image/jpeg', 'image/webp')`),
    check('user_profiles_avatar_size', sql`${t.avatarSize} is null or (${t.avatarSize} between 1 and ${sql.raw(String(AVATAR_MAX_BYTES))} and ${t.avatarSize} = octet_length(${t.avatarData}))`),
    check('user_profiles_avatar_hash', sql`${t.avatarSha256} is null or ${t.avatarSha256} ~ '^[0-9a-f]{64}$'`),
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
