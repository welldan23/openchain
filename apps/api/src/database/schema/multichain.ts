import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { blockNumber, idColumn, rawAmount, refId, timestampTz, usdAmount } from './columns.js';
import { bridgeMatchStatus, chainFamily, confidenceLevel, dataStatus, infoClassification } from './enums.js';
import { addresses, chains, labels } from './reference.js';
import { tokenTransfers } from './activity.js';
import { addressFlowScans, nativeTransfers } from './transfers.js';

/**
 * Satu pemindaian lintas chain untuk satu address. Di chain satu keluarga
 * (mis. semua EVM) address yang sama bisa dipakai di banyak chain, jadi
 * identitasnya adalah bentuk ternormalisasi per keluarga, bukan id per chain.
 */
export const multichainScans = pgTable(
  'multichain_scans',
  {
    id: idColumn(),
    family: chainFamily('family').notNull(),
    /** Identifier asli seperti yang diminta. */
    address: text('address').notNull(),
    addressNormalized: text('address_normalized').notNull(),
    windowFrom: timestampTz('window_from').notNull(),
    windowTo: timestampTz('window_to').notNull(),
    /** Gabungan status semua chain: `complete` hanya bila semua chain lengkap. */
    status: dataStatus('status').notNull(),
    statusReason: text('status_reason'),
    missingFields: text('missing_fields')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    scannedAt: timestampTz('scanned_at').notNull(),
  },
  (t) => [
    index('multichain_scans_address_idx').on(t.family, t.addressNormalized, t.scannedAt),
    check('multichain_scans_window', sql`${t.windowFrom} <= ${t.windowTo}`),
    check('multichain_scans_unavailable_has_reason', sql`${t.status} <> 'unavailable' or ${t.statusReason} is not null`),
    check(
      'multichain_scans_partial_is_explained',
      sql`${t.status} <> 'partial' or ${t.statusReason} is not null or cardinality(${t.missingFields}) > 0`,
    ),
  ],
);

/**
 * Ringkasan aktivitas address di satu chain pada sebuah pemindaian lintas
 * chain. Nilai yang belum diketahui disimpan kosong, bukan nol: chain yang
 * gagal dibaca tidak sama dengan chain tanpa aktivitas.
 */
export const multichainChainActivity = pgTable(
  'multichain_chain_activity',
  {
    id: idColumn(),
    scanId: refId('scan_id')
      .notNull()
      .references(() => multichainScans.id, { onDelete: 'cascade' }),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    /** Kosong bila address belum pernah tercatat di chain ini. */
    addressId: refId('address_id'),
    /** Pemindaian aliran dana yang jadi dasar angka di baris ini. */
    flowScanId: refId('flow_scan_id').references(() => addressFlowScans.id),
    status: dataStatus('status').notNull(),
    statusReason: text('status_reason'),
    txCount: integer('tx_count'),
    inUsd: usdAmount('in_usd'),
    outUsd: usdAmount('out_usd'),
    counterpartyCount: integer('counterparty_count'),
    firstSeenAt: timestampTz('first_seen_at'),
    lastSeenAt: timestampTz('last_seen_at'),
    /** Saldo native coin pada `snapshot_block`. */
    nativeBalanceRaw: rawAmount('native_balance_raw'),
    balanceUsd: usdAmount('balance_usd'),
    snapshotBlock: blockNumber('snapshot_block'),
    fetchedAt: timestampTz('fetched_at'),
  },
  (t) => [
    unique('multichain_chain_activity_scan_chain_unique').on(t.scanId, t.chainId),
    foreignKey({
      name: 'multichain_chain_activity_chain_address_fk',
      columns: [t.chainId, t.addressId],
      foreignColumns: [addresses.chainId, addresses.id],
    }),
    check('multichain_chain_activity_unavailable_has_reason', sql`${t.status} <> 'unavailable' or ${t.statusReason} is not null`),
    check('multichain_chain_activity_partial_has_reason', sql`${t.status} <> 'partial' or ${t.statusReason} is not null`),
    // Angka hanya boleh ada bila chain ini benar-benar terbaca.
    check(
      'multichain_chain_activity_unavailable_has_no_numbers',
      sql`${t.status} <> 'unavailable' or (${t.txCount} is null and ${t.inUsd} is null and ${t.outUsd} is null and ${t.counterpartyCount} is null)`,
    ),
    check(
      'multichain_chain_activity_counts_non_negative',
      sql`coalesce(${t.txCount}, 0) >= 0 and coalesce(${t.counterpartyCount}, 0) >= 0 and coalesce(${t.inUsd}, 0) >= 0 and coalesce(${t.outUsd}, 0) >= 0 and coalesce(${t.nativeBalanceRaw}, 0) >= 0 and coalesce(${t.balanceUsd}, 0) >= 0`,
    ),
    check('multichain_chain_activity_seen_order', sql`${t.firstSeenAt} is null or ${t.lastSeenAt} is null or ${t.firstSeenAt} <= ${t.lastSeenAt}`),
  ],
);

/**
 * Perpindahan aset lewat bridge. Kaki kirim (transfer ke kontrak bridge di
 * chain asal) adalah fakta on-chain. Kaki terima di chain tujuan dicocokkan
 * lewat jumlah, waktu, dan penerima, jadi pencocokannya selalu `heuristic`
 * dengan tingkat keyakinan; bridge yang mencatat id pesan bisa naik
 * keyakinannya, tapi tidak pernah disebut fakta.
 */
export const bridgeTransfers = pgTable(
  'bridge_transfers',
  {
    id: idColumn(),
    sourceChainId: text('source_chain_id')
      .notNull()
      .references(() => chains.id),
    destChainId: text('dest_chain_id')
      .notNull()
      .references(() => chains.id),
    /** Kontrak bridge di chain asal. */
    bridgeAddressId: refId('bridge_address_id').notNull(),
    /** Label yang mengenali kontrak itu sebagai bridge, beserta sumbernya. */
    bridgeLabelId: refId('bridge_label_id').references(() => labels.id),
    senderAddressId: refId('sender_address_id').notNull(),
    /** Penerima di chain tujuan; kosong sampai kaki terima ditemukan. */
    recipientAddressId: refId('recipient_address_id'),
    sentNativeTransferId: refId('sent_native_transfer_id'),
    sentTokenTransferId: refId('sent_token_transfer_id'),
    receivedNativeTransferId: refId('received_native_transfer_id'),
    receivedTokenTransferId: refId('received_token_transfer_id'),
    amountSentRaw: rawAmount('amount_sent_raw').notNull(),
    amountReceivedRaw: rawAmount('amount_received_raw'),
    amountUsd: usdAmount('amount_usd'),
    status: bridgeMatchStatus('status').notNull(),
    /** Klasifikasi pencocokan kedua kaki; selalu `heuristic`. */
    matchClassification: infoClassification('match_classification').notNull().default('heuristic'),
    matchHeuristic: text('match_heuristic'),
    matchConfidence: confidenceLevel('match_confidence'),
    /** Alasan cocok atau belum cocok, dalam bahasa sederhana. */
    matchReason: text('match_reason'),
    sentAt: timestampTz('sent_at').notNull(),
    receivedAt: timestampTz('received_at'),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (t) => [
    unique('bridge_transfers_sent_native_unique').on(t.sentNativeTransferId),
    unique('bridge_transfers_sent_token_unique').on(t.sentTokenTransferId),
    index('bridge_transfers_sender_idx').on(t.senderAddressId, t.sentAt),
    index('bridge_transfers_recipient_idx').on(t.recipientAddressId, t.receivedAt),
    foreignKey({ name: 'bridge_transfers_bridge_fk', columns: [t.sourceChainId, t.bridgeAddressId], foreignColumns: [addresses.chainId, addresses.id] }),
    foreignKey({ name: 'bridge_transfers_sender_fk', columns: [t.sourceChainId, t.senderAddressId], foreignColumns: [addresses.chainId, addresses.id] }),
    foreignKey({ name: 'bridge_transfers_recipient_fk', columns: [t.destChainId, t.recipientAddressId], foreignColumns: [addresses.chainId, addresses.id] }),
    foreignKey({
      name: 'bridge_transfers_sent_native_fk',
      columns: [t.sourceChainId, t.sentNativeTransferId],
      foreignColumns: [nativeTransfers.chainId, nativeTransfers.id],
    }),
    foreignKey({
      name: 'bridge_transfers_sent_token_fk',
      columns: [t.sourceChainId, t.sentTokenTransferId],
      foreignColumns: [tokenTransfers.chainId, tokenTransfers.id],
    }),
    foreignKey({
      name: 'bridge_transfers_received_native_fk',
      columns: [t.destChainId, t.receivedNativeTransferId],
      foreignColumns: [nativeTransfers.chainId, nativeTransfers.id],
    }),
    foreignKey({
      name: 'bridge_transfers_received_token_fk',
      columns: [t.destChainId, t.receivedTokenTransferId],
      foreignColumns: [tokenTransfers.chainId, tokenTransfers.id],
    }),
    check('bridge_transfers_distinct_chains', sql`${t.sourceChainId} <> ${t.destChainId}`),
    check('bridge_transfers_one_sent_transfer', sql`(${t.sentNativeTransferId} is null) <> (${t.sentTokenTransferId} is null)`),
    check('bridge_transfers_at_most_one_received', sql`${t.receivedNativeTransferId} is null or ${t.receivedTokenTransferId} is null`),
    check('bridge_transfers_match_is_heuristic', sql`${t.matchClassification} = 'heuristic'`),
    check('bridge_transfers_amount_positive', sql`${t.amountSentRaw} > 0 and coalesce(${t.amountReceivedRaw}, 1) > 0`),
    // Cocok wajib menunjuk kaki terima beserta dasar dan keyakinannya; selain itu kaki terima kosong.
    check(
      'bridge_transfers_matched_has_evidence',
      sql`(${t.status} = 'matched') = (coalesce(${t.receivedNativeTransferId}, ${t.receivedTokenTransferId}) is not null)`,
    ),
    check(
      'bridge_transfers_matched_is_explained',
      sql`${t.status} <> 'matched' or (${t.matchHeuristic} is not null and ${t.matchConfidence} is not null and ${t.recipientAddressId} is not null and ${t.amountReceivedRaw} is not null and ${t.receivedAt} is not null)`,
    ),
    check('bridge_transfers_received_after_sent', sql`${t.receivedAt} is null or ${t.receivedAt} >= ${t.sentAt}`),
  ],
);
