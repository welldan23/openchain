import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import { blockNumber, idColumn, refId, timestampTz } from './columns.js';
import {
  chainFamily,
  chainSupportStatus,
  dataStatus,
  entityLabelType,
  infoClassification,
  labelSource,
  providerKind,
} from './enums.js';

/** Daftar chain. Isi awalnya ada di migrasi data `seed_chains`. */
export const chains = pgTable(
  'chains',
  {
    /** Slug stabil, mis. `robinhood` atau `ethereum`. */
    id: text('id').primaryKey(),
    family: chainFamily('family').notNull(),
    /** Chain ID EVM; wajib untuk chain EVM, kosong untuk yang lain. */
    evmChainId: integer('evm_chain_id').unique(),
    name: text('name').notNull(),
    nativeSymbol: text('native_symbol').notNull(),
    explorerUrl: text('explorer_url'),
    supportStatus: chainSupportStatus('support_status')
      .notNull()
      .default('planned'),
    createdAt: timestampTz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('chains_id_is_slug', sql`${t.id} ~ '^[a-z0-9-]+$'`),
    check(
      'chains_evm_chain_id_matches_family',
      sql`(${t.family} = 'evm') = (${t.evmChainId} is not null)`,
    ),
  ],
);

/**
 * Address per chain. `address` menyimpan identifier asli seperti pertama kali
 * dicatat dan tidak pernah diubah; duplikat dicegah lewat `address_normalized`.
 */
export const addresses = pgTable(
  'addresses',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    address: text('address').notNull(),
    addressNormalized: text('address_normalized').notNull(),
    /** `null` berarti belum diketahui. */
    isContract: boolean('is_contract'),
    firstSeenAt: timestampTz('first_seen_at').notNull().defaultNow(),
  },
  (t) => [
    unique('addresses_chain_address_unique').on(
      t.chainId,
      t.addressNormalized,
    ),
    // Dipakai foreign key komposit agar token tidak menunjuk address chain lain.
    unique('addresses_chain_id_id_unique').on(t.chainId, t.id),
  ],
);

/**
 * Catatan setiap pengambilan data dari provider, termasuk yang gagal.
 * Data yang gagal tidak boleh dikarang; alasannya disimpan di sini.
 */
export const providerRuns = pgTable(
  'provider_runs',
  {
    id: idColumn(),
    /** Nama provider, mis. `blockscout` atau `robinhood-rpc`. */
    provider: text('provider').notNull(),
    kind: providerKind('kind').notNull(),
    chainId: text('chain_id').references(() => chains.id),
    /** Operasi yang dijalankan, mis. `token.holders`. */
    operation: text('operation').notNull(),
    /** Address atau hash yang diminta. */
    subject: text('subject'),
    status: dataStatus('status').notNull(),
    errorReason: text('error_reason'),
    blockFrom: blockNumber('block_from'),
    blockTo: blockNumber('block_to'),
    missingFields: text('missing_fields')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    startedAt: timestampTz('started_at').notNull().defaultNow(),
    fetchedAt: timestampTz('fetched_at'),
  },
  (t) => [
    index('provider_runs_subject_idx').on(t.chainId, t.subject),
    check(
      'provider_runs_unavailable_has_reason',
      sql`${t.status} <> 'unavailable' or ${t.errorReason} is not null`,
    ),
    check(
      'provider_runs_partial_is_explained',
      sql`${t.status} <> 'partial' or ${t.errorReason} is not null or cardinality(${t.missingFields}) > 0`,
    ),
    check(
      'provider_runs_block_range',
      sql`${t.blockFrom} is null or ${t.blockTo} is null or ${t.blockFrom} <= ${t.blockTo}`,
    ),
  ],
);

/**
 * Label entitas sebuah address beserta sumbernya, supaya asal label selalu
 * transparan. Label eksternal bersifat probabilistik, bukan bukti kepemilikan.
 */
export const labels = pgTable(
  'labels',
  {
    id: idColumn(),
    addressId: refId('address_id')
      .notNull()
      .references(() => addresses.id, { onDelete: 'cascade' }),
    labelType: entityLabelType('label_type').notNull(),
    /** Nama entitas bila ada, mis. "Uniswap V2: NBLA/WETH". */
    name: text('name'),
    source: labelSource('source').notNull(),
    /** Nama sumber, mis. "Arkham" atau "OpenChain heuristic". */
    sourceName: text('source_name').notNull(),
    classification: infoClassification('classification').notNull(),
    /** 0–1; wajib untuk label heuristic. */
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    providerRunId: refId('provider_run_id').references(() => providerRuns.id),
    createdAt: timestampTz('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('labels_address_type_source_unique').on(
      t.addressId,
      t.labelType,
      t.sourceName,
    ),
    check(
      'labels_confidence_range',
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
    check(
      'labels_classification_matches_source',
      sql`(${t.source} = 'external' and ${t.classification} = 'external_label')
        or (${t.source} = 'heuristic' and ${t.classification} = 'heuristic')
        or (${t.source} = 'user' and ${t.classification} = 'assumption')`,
    ),
    check(
      'labels_heuristic_has_confidence',
      sql`${t.source} <> 'heuristic' or ${t.confidence} is not null`,
    ),
  ],
);
