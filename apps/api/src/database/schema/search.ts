import { sql } from 'drizzle-orm';
import { check, customType, foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { idColumn, refId, timestampTz } from './columns.js';
import { entityLabelType, labelSource, searchEntityKind } from './enums.js';
import { addresses, chains } from './reference.js';
import { tokens } from './tokens.js';

/** Kolom `tsvector` PostgreSQL untuk pencarian teks. */
const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

/**
 * Indeks pencarian teks: satu baris per token atau address per chain, dengan
 * teks yang bisa dicari (nama, simbol, nama label, address) dan label
 * utamanya untuk ditampilkan. Isinya turunan dari `tokens`, `addresses`, dan
 * `labels`, jadi bisa dibangun ulang kapan saja; data aslinya tetap di tabel
 * sumber. Hash transaksi dan address persis dicari langsung di tabel sumber.
 */
export const searchEntities = pgTable(
  'search_entities',
  {
    id: idColumn(),
    kind: searchEntityKind('kind').notNull(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    /** Address entitas: kontrak token, atau address itu sendiri. */
    addressId: refId('address_id').notNull(),
    /** Terisi hanya untuk `token`. */
    tokenId: refId('token_id'),
    /** Judul hasil, mis. "Nebula Finance (NBLA)" atau nama label address. */
    title: text('title').notNull(),
    /** Keterangan kecil, mis. simbol token atau address pendek. */
    subtitle: text('subtitle'),
    /** Label utama (eksternal dulu) untuk ditampilkan; kosong bila tanpa label. */
    labelType: entityLabelType('label_type'),
    labelName: text('label_name'),
    labelSource: labelSource('label_source'),
    labelSourceName: text('label_source_name'),
    /** Teks yang dicari: huruf kecil, dipisah spasi. */
    searchText: text('search_text').notNull(),
    searchVector: tsvector('search_vector')
      .notNull()
      .generatedAlwaysAs((): ReturnType<typeof sql> => sql`to_tsvector('simple', ${searchEntities.searchText})`),
    refreshedAt: timestampTz('refreshed_at').notNull(),
  },
  (t) => [
    unique('search_entities_kind_address_unique').on(t.kind, t.chainId, t.addressId),
    index('search_entities_vector_idx').using('gin', t.searchVector),
    foreignKey({ name: 'search_entities_chain_address_fk', columns: [t.chainId, t.addressId], foreignColumns: [addresses.chainId, addresses.id] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'search_entities_chain_token_fk', columns: [t.chainId, t.tokenId], foreignColumns: [tokens.chainId, tokens.id] }).onDelete(
      'cascade',
    ),
    check('search_entities_token_has_token_id', sql`(${t.kind} = 'token') = (${t.tokenId} is not null)`),
    check('search_entities_search_text_lowercase', sql`${t.searchText} = lower(${t.searchText}) and length(${t.searchText}) > 0`),
    // Label tampil wajib lengkap dengan sumbernya, atau tidak ada sama sekali.
    check(
      'search_entities_label_has_source',
      sql`(${t.labelType} is null) = (${t.labelSource} is null) and (${t.labelSource} is null) = (${t.labelSourceName} is null)`,
    ),
  ],
);
