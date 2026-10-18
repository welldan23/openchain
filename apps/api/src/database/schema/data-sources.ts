/**
 * Katalog sumber data (provider) dan saklar per akun. Katalog di-seed oleh
 * migrasi dan hanya berisi provider yang benar-benar dipanggil API, plus
 * kandidat yang sudah diaudit tapi belum terhubung. Kondisi sumber tidak
 * disimpan di sini; dihitung dari `provider_runs`. Chain yang dicakup dibaca
 * dari definisi adapter, bukan dari tabel ini. Environment variable hanya
 * dicatat nama dan kegunaannya, tidak pernah nilainya.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { users } from './accounts.js';
import { refId, timestampTz } from './columns.js';
import { providerKind } from './enums.js';

/** Environment variable yang mengatur sebuah sumber. `name` boleh berisi `<CHAIN>` untuk variabel per chain. */
export interface DataSourceEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export const dataSources = pgTable(
  'data_sources',
  {
    /** Slug stabil, mis. `blockscout`. */
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: providerKind('kind').notNull(),
    /** Kegunaan sumber ini dalam bahasa sederhana. */
    description: text('description').notNull(),
    /** Sudah dipanggil oleh API; `false` untuk kandidat yang belum terhubung. */
    integrated: boolean('integrated').notNull(),
    /** Pola LIKE untuk kolom `provider_runs.provider`, mis. `%-rpc`; dipakai menghitung kondisi sumber. */
    runProviderPattern: text('run_provider_pattern'),
    /** Wajib untuk analisis on-chain, jadi tidak bisa dimatikan. */
    required: boolean('required').notNull().default(false),
    /** Alasan sumber tidak bisa diatur pengguna; wajib ada bila wajib atau belum terhubung. */
    lockedReason: text('locked_reason'),
    /** Akibat bila sumber dimatikan. */
    offEffect: text('off_effect').notNull(),
    /** Atribusi yang wajib ditampilkan menurut syarat pakai provider, mis. `Powered by GoPlus`. */
    attribution: text('attribution'),
    envVars: jsonb('env_vars').$type<DataSourceEnvVar[]>().notNull().default([]),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    check('data_sources_id_format', sql`${t.id} ~ '^[a-z0-9-]{1,40}$'`),
    check('data_sources_name_length', sql`length(btrim(${t.name})) between 1 and 80`),
    check('data_sources_description_length', sql`length(btrim(${t.description})) between 1 and 500`),
    check('data_sources_off_effect_length', sql`length(btrim(${t.offEffect})) between 1 and 300`),
    check('data_sources_env_vars_is_array', sql`jsonb_typeof(${t.envVars}) = 'array'`),
    // Sumber yang belum terhubung tidak punya catatan pengambilan dan tidak bisa diwajibkan.
    check('data_sources_pattern_when_integrated', sql`${t.integrated} = (${t.runProviderPattern} is not null)`),
    check('data_sources_required_is_integrated', sql`not ${t.required} or ${t.integrated}`),
    check('data_sources_locked_is_explained', sql`(${t.required} or not ${t.integrated}) = (${t.lockedReason} is not null)`),
  ],
);

/**
 * Saklar sumber data per akun. Hanya pilihan yang diubah pengguna yang
 * disimpan; tanpa baris berarti mengikuti bawaan (nyala bila sudah
 * terhubung). Sumber yang wajib atau belum terhubung ditolak di service.
 */
export const userDataSourceSettings = pgTable(
  'user_data_source_settings',
  {
    userId: refId('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => dataSources.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sourceId] }), index('user_data_source_settings_source_idx').on(t.sourceId)],
);
