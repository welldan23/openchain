import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, numeric, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { blockNumber, idColumn, refId, timestampTz } from './columns.js';
import { dataStatus, mapEdgeKind, mapNodeRole } from './enums.js';
import { addresses, chains } from './reference.js';
import { tokens, tokenSnapshots } from './tokens.js';
import { tokenTransfers } from './activity.js';
import { nativeTransfers } from './transfers.js';

/**
 * Satu peta hubungan holder sebuah token, dibangun dari data sampai blok
 * tertentu. Disimpan per pembangunan supaya peta lama bisa dibuka ulang
 * dengan hasil yang sama, beserta parameter dan kelengkapan datanya.
 */
export const walletMaps = pgTable(
  'wallet_maps',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    tokenId: refId('token_id').notNull(),
    /** Snapshot holder yang menjadi dasar porsi supply; kosong bila belum ada. */
    snapshotId: refId('snapshot_id'),
    /** Data transfer dan pendanaan yang dipakai sampai blok ini. */
    blockNumber: blockNumber('block_number').notNull(),
    /** Jumlah holder teratas yang dipetakan. */
    holderLimit: integer('holder_limit').notNull(),
    /** Berapa lapis pendana ke belakang yang ditelusuri. */
    fundingDepth: integer('funding_depth').notNull(),
    status: dataStatus('status').notNull(),
    statusReason: text('status_reason'),
    missingFields: text('missing_fields')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    builtAt: timestampTz('built_at').notNull(),
  },
  (t) => [
    index('wallet_maps_token_built_idx').on(t.tokenId, t.builtAt),
    // Dipakai foreign key komposit node agar address tidak dari chain lain.
    unique('wallet_maps_id_chain_unique').on(t.id, t.chainId),
    foreignKey({ name: 'wallet_maps_chain_token_fk', columns: [t.chainId, t.tokenId], foreignColumns: [tokens.chainId, tokens.id] }),
    foreignKey({
      name: 'wallet_maps_token_snapshot_fk',
      columns: [t.tokenId, t.snapshotId],
      foreignColumns: [tokenSnapshots.tokenId, tokenSnapshots.id],
    }),
    check('wallet_maps_holder_limit_range', sql`${t.holderLimit} between 1 and 1000`),
    check('wallet_maps_funding_depth_range', sql`${t.fundingDepth} between 0 and 5`),
    check('wallet_maps_unavailable_has_reason', sql`${t.status} <> 'unavailable' or ${t.statusReason} is not null`),
    check(
      'wallet_maps_partial_is_explained',
      sql`${t.status} <> 'partial' or ${t.statusReason} is not null or cardinality(${t.missingFields}) > 0`,
    ),
  ],
);

/** Wallet di peta. Porsi supply hanya untuk holder; penghubung selalu 0. */
export const mapNodes = pgTable(
  'map_nodes',
  {
    id: idColumn(),
    mapId: refId('map_id').notNull(),
    chainId: text('chain_id').notNull(),
    addressId: refId('address_id').notNull(),
    role: mapNodeRole('role').notNull(),
    /** Persen supply pada snapshot peta, 6 angka di belakang koma. */
    sharePct: numeric('share_pct', { precision: 9, scale: 6 }).notNull().default('0'),
    /** `null` bila belum diketahui. */
    isContract: boolean('is_contract'),
  },
  (t) => [
    unique('map_nodes_map_address_unique').on(t.mapId, t.addressId),
    // Dipakai foreign key komposit edge agar kedua ujungnya dari peta yang sama.
    unique('map_nodes_map_id_unique').on(t.mapId, t.id),
    foreignKey({ name: 'map_nodes_map_fk', columns: [t.mapId, t.chainId], foreignColumns: [walletMaps.id, walletMaps.chainId] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'map_nodes_chain_address_fk', columns: [t.chainId, t.addressId], foreignColumns: [addresses.chainId, addresses.id] }),
    check('map_nodes_share_range', sql`${t.sharePct} >= 0 and ${t.sharePct} <= 100`),
    check('map_nodes_non_holder_has_no_share', sql`${t.role} = 'holder' or ${t.sharePct} = 0`),
  ],
);

/**
 * Hubungan dua wallet di peta. Setiap garis wajib menunjuk tepat satu
 * transfer tersimpan sebagai bukti transaksinya, jadi tidak ada garis tanpa
 * fakta on-chain di belakangnya.
 */
export const mapEdges = pgTable(
  'map_edges',
  {
    id: idColumn(),
    mapId: refId('map_id').notNull(),
    fromNodeId: refId('from_node_id').notNull(),
    toNodeId: refId('to_node_id').notNull(),
    kind: mapEdgeKind('kind').notNull(),
    nativeTransferId: refId('native_transfer_id').references(() => nativeTransfers.id),
    tokenTransferId: refId('token_transfer_id').references(() => tokenTransfers.id),
  },
  (t) => [
    index('map_edges_map_idx').on(t.mapId),
    unique('map_edges_map_native_unique').on(t.mapId, t.nativeTransferId),
    unique('map_edges_map_token_unique').on(t.mapId, t.tokenTransferId),
    foreignKey({ name: 'map_edges_from_node_fk', columns: [t.mapId, t.fromNodeId], foreignColumns: [mapNodes.mapId, mapNodes.id] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'map_edges_to_node_fk', columns: [t.mapId, t.toNodeId], foreignColumns: [mapNodes.mapId, mapNodes.id] }).onDelete(
      'cascade',
    ),
    check('map_edges_distinct_nodes', sql`${t.fromNodeId} <> ${t.toNodeId}`),
    check('map_edges_one_transfer', sql`(${t.nativeTransferId} is null) <> (${t.tokenTransferId} is null)`),
    // Transfer token yang dipetakan selalu berasal dari tabel transfer token.
    check('map_edges_token_kind_has_token_transfer', sql`${t.kind} <> 'token_transfer' or ${t.tokenTransferId} is not null`),
  ],
);
