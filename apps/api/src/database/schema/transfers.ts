import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import {
  blockNumber,
  idColumn,
  rawAmount,
  refId,
  timestampTz,
  usdAmount,
} from './columns.js';
import { dataStatus, infoClassification, movementType, nativeTransferKind } from './enums.js';
import { addresses, chains, labels, providerRuns } from './reference.js';
import { tokenTransfers } from './activity.js';

/**
 * Perpindahan native coin (ETH, SOL, ...) untuk Lacak Aliran Dana. Transfer
 * token ada di `token_transfers`; keduanya dibaca bersama per address.
 *
 * Satu transaksi bisa punya beberapa baris: nilai transaksi itu sendiri
 * (`transaction`, `trace_path` kosong) dan panggilan internal kontrak
 * (`internal`, `trace_path` mis. `0.1`). Tanpa foreign key ke `transactions`
 * supaya transfer tetap tersimpan walau detail transaksinya belum diambil.
 */
export const nativeTransfers = pgTable(
  'native_transfers',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    txHash: text('tx_hash').notNull(),
    kind: nativeTransferKind('kind').notNull(),
    /**
     * Posisi panggilan internal di trace (EVM: indeks bertingkat dipisah titik,
     * Solana: indeks instruksi). Kosong untuk nilai transaksi itu sendiri.
     */
    tracePath: text('trace_path').notNull().default(''),
    fromAddressId: refId('from_address_id')
      .notNull()
      .references(() => addresses.id),
    toAddressId: refId('to_address_id')
      .notNull()
      .references(() => addresses.id),
    /** Jumlah dalam satuan terkecil (wei, lamport). */
    amountRaw: rawAmount('amount_raw').notNull(),
    /** Nilai USD saat transaksi; kosong bila harga saat itu tidak diketahui. */
    amountUsd: usdAmount('amount_usd'),
    blockNumber: blockNumber('block_number').notNull(),
    blockTimestamp: timestampTz('block_timestamp').notNull(),
    providerRunId: refId('provider_run_id').references(() => providerRuns.id),
    fetchedAt: timestampTz('fetched_at').notNull(),
  },
  (t) => [
    unique('native_transfers_identity_unique').on(
      t.chainId,
      t.txHash,
      t.kind,
      t.tracePath,
    ),
    index('native_transfers_from_time_idx').on(t.fromAddressId, t.blockTimestamp),
    index('native_transfers_to_time_idx').on(t.toAddressId, t.blockTimestamp),
    index('native_transfers_chain_block_idx').on(t.chainId, t.blockNumber),
    foreignKey({
      name: 'native_transfers_chain_from_fk',
      columns: [t.chainId, t.fromAddressId],
      foreignColumns: [addresses.chainId, addresses.id],
    }),
    foreignKey({
      name: 'native_transfers_chain_to_fk',
      columns: [t.chainId, t.toAddressId],
      foreignColumns: [addresses.chainId, addresses.id],
    }),
    // Transaksi tanpa nilai bukan aliran dana; jangan dicatat sebagai transfer.
    check('native_transfers_amount_positive', sql`${t.amountRaw} > 0`),
    check(
      'native_transfers_usd_non_negative',
      sql`${t.amountUsd} is null or ${t.amountUsd} >= 0`,
    ),
    check(
      'native_transfers_trace_path_matches_kind',
      sql`(${t.kind} = 'transaction') = (${t.tracePath} = '')`,
    ),
  ],
);

/**
 * Cakupan pemindaian aliran dana satu address: rentang blok/waktu yang sudah
 * dibaca dan jenis transfer yang tercakup. Dipakai untuk menandai data
 * lengkap atau sebagian, supaya transfer yang belum dipindai tidak dianggap
 * tidak ada. Satu baris per pemindaian.
 */
export const addressFlowScans = pgTable(
  'address_flow_scans',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    addressId: refId('address_id')
      .notNull()
      .references(() => addresses.id),
    blockFrom: blockNumber('block_from').notNull(),
    blockTo: blockNumber('block_to').notNull(),
    windowFrom: timestampTz('window_from').notNull(),
    windowTo: timestampTz('window_to').notNull(),
    /** Nilai native yang dikirim transaksi. */
    nativeScanned: boolean('native_scanned').notNull(),
    /** Event transfer token. */
    tokensScanned: boolean('tokens_scanned').notNull(),
    /** Panggilan internal kontrak; sering tidak tersedia tanpa node trace. */
    internalScanned: boolean('internal_scanned').notNull(),
    status: dataStatus('status').notNull(),
    statusReason: text('status_reason'),
    missingFields: text('missing_fields')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    providerRunId: refId('provider_run_id').references(() => providerRuns.id),
    scannedAt: timestampTz('scanned_at').notNull(),
  },
  (t) => [
    index('address_flow_scans_address_time_idx').on(
      t.addressId,
      t.chainId,
      t.scannedAt,
    ),
    foreignKey({
      name: 'address_flow_scans_chain_address_fk',
      columns: [t.chainId, t.addressId],
      foreignColumns: [addresses.chainId, addresses.id],
    }),
    check('address_flow_scans_block_range', sql`${t.blockFrom} <= ${t.blockTo}`),
    check('address_flow_scans_window', sql`${t.windowFrom} <= ${t.windowTo}`),
    // "Lengkap" hanya sah bila semua jenis transfer benar-benar dipindai.
    check(
      'address_flow_scans_complete_covers_all',
      sql`${t.status} <> 'complete' or (${t.nativeScanned} and ${t.tokensScanned} and ${t.internalScanned})`,
    ),
    check(
      'address_flow_scans_unavailable_has_reason',
      sql`${t.status} <> 'unavailable' or ${t.statusReason} is not null`,
    ),
    check(
      'address_flow_scans_partial_is_explained',
      sql`${t.status} <> 'partial' or ${t.statusReason} is not null or cardinality(${t.missingFields}) > 0`,
    ),
  ],
);

/**
 * Jenis tiap perpindahan dana (mis. setoran ke exchange) beserta klasifikasi
 * informasinya. Disimpan terpisah dari transfer: transfernya fakta on-chain,
 * sedangkan jenisnya tafsiran yang bisa dihitung ulang saat label berubah.
 * Tepat satu dari `native_transfer_id` dan `token_transfer_id` terisi.
 */
export const movementClassifications = pgTable(
  'movement_classifications',
  {
    id: idColumn(),
    nativeTransferId: refId('native_transfer_id').references(() => nativeTransfers.id, { onDelete: 'cascade' }),
    tokenTransferId: refId('token_transfer_id').references(() => tokenTransfers.id, { onDelete: 'cascade' }),
    movementType: movementType('movement_type').notNull(),
    /**
     * `verified_fact` untuk transfer biasa dan mint/burn (address nol);
     * selebihnya mengikuti sumber label yang dipakai.
     */
    classification: infoClassification('classification').notNull(),
    /** Alasan dalam bahasa sederhana, mis. "Penerima berlabel exchange (Blockscout)". */
    basis: text('basis').notNull(),
    /** Label yang menjadi dasar; kosong untuk transfer biasa dan mint/burn. */
    labelId: refId('label_id').references(() => labels.id, { onDelete: 'set null' }),
    /** 0–1; wajib untuk tafsiran heuristic. */
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    classifiedAt: timestampTz('classified_at').notNull(),
  },
  (t) => [
    unique('movement_classifications_native_unique').on(t.nativeTransferId),
    unique('movement_classifications_token_unique').on(t.tokenTransferId),
    check(
      'movement_classifications_one_transfer',
      sql`(${t.nativeTransferId} is null) <> (${t.tokenTransferId} is null)`,
    ),
    check(
      'movement_classifications_allowed_classification',
      sql`${t.classification} in ('verified_fact', 'external_label', 'heuristic', 'assumption')`,
    ),
    // Transfer biasa dan mint/burn adalah fakta; jenis lain lahir dari label, jadi bukan fakta.
    check(
      'movement_classifications_fact_types',
      sql`(${t.movementType} in ('transfer', 'mint', 'burn')) = (${t.classification} = 'verified_fact')`,
    ),
    check(
      'movement_classifications_heuristic_has_confidence',
      sql`${t.classification} <> 'heuristic' or ${t.confidence} is not null`,
    ),
    check(
      'movement_classifications_confidence_range',
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
  ],
);
