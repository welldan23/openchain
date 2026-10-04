import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, numeric, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import { blockNumber, idColumn, refId, timestampTz } from './columns.js';
import {
  clusterLabel,
  confidenceLevel,
  coordinationAction,
  coordinationKind,
  dataStatus,
  infoClassification,
  mapEdgeKind,
  mapNodeRole,
} from './enums.js';
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
    /**
     * Waktu kelompok wallet dihitung; kosong berarti belum dianalisis, beda
     * dengan sudah dianalisis tanpa kelompok.
     */
    clusteredAt: timestampTz('clustered_at'),
    /** Nama dan versi heuristic pengelompokan yang dipakai. */
    clusterHeuristic: text('cluster_heuristic'),
    /** Waktu kejadian koordinasi dideteksi; kosong berarti belum dianalisis. */
    coordinatedAt: timestampTz('coordinated_at'),
    /** Nama dan versi heuristic deteksi koordinasi yang dipakai. */
    coordinationHeuristic: text('coordination_heuristic'),
  },
  (t) => [
    index('wallet_maps_token_built_idx').on(t.tokenId, t.builtAt),
    check('wallet_maps_clustering_complete', sql`(${t.clusteredAt} is null) = (${t.clusterHeuristic} is null)`),
    check('wallet_maps_coordination_complete', sql`(${t.coordinatedAt} is null) = (${t.coordinationHeuristic} is null)`),
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

/**
 * Kelompok wallet yang diduga terkait dalam satu peta. Selalu heuristic:
 * pengelompokan adalah dugaan dari pola transaksi, bukan bukti kepemilikan.
 */
export const mapClusters = pgTable(
  'map_clusters',
  {
    id: idColumn(),
    mapId: refId('map_id')
      .notNull()
      .references(() => walletMaps.id, { onDelete: 'cascade' }),
    /** Id stabil di dalam peta, mis. `pendana-bersama`. */
    key: text('key').notNull(),
    name: text('name').notNull(),
    /** Alasan pengelompokan dalam bahasa sederhana. */
    reason: text('reason').notNull(),
    labels: clusterLabel('labels').array().notNull(),
    confidence: confidenceLevel('confidence').notNull(),
    /** Hal yang bisa membuat dugaan ini keliru. */
    caveats: text('caveats')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    classification: infoClassification('classification').notNull().default('heuristic'),
    /** Nama dan versi heuristic yang menghasilkan kelompok ini. */
    heuristicName: text('heuristic_name').notNull(),
    /**
     * Ada transaksi langsung antara anggota dan deployer/tim. Syarat label
     * `insider_or_team`; diisi oleh heuristic yang menemukannya.
     */
    hasDirectEvidence: boolean('has_direct_evidence').notNull().default(false),
  },
  (t) => [
    unique('map_clusters_map_key_unique').on(t.mapId, t.key),
    unique('map_clusters_map_id_unique').on(t.mapId, t.id),
    check('map_clusters_is_heuristic', sql`${t.classification} = 'heuristic'`),
    check('map_clusters_has_labels', sql`cardinality(${t.labels}) > 0`),
    check(
      'map_clusters_insider_needs_direct_evidence',
      sql`not ('insider_or_team' = any(${t.labels})) or ${t.hasDirectEvidence}`,
    ),
  ],
);

/** Anggota kelompok. Satu wallet paling banyak masuk satu kelompok per peta. */
export const mapClusterMembers = pgTable(
  'map_cluster_members',
  {
    mapId: refId('map_id').notNull(),
    clusterId: refId('cluster_id').notNull(),
    nodeId: refId('node_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'map_cluster_members_pk', columns: [t.clusterId, t.nodeId] }),
    unique('map_cluster_members_one_cluster_per_node').on(t.mapId, t.nodeId),
    foreignKey({
      name: 'map_cluster_members_cluster_fk',
      columns: [t.mapId, t.clusterId],
      foreignColumns: [mapClusters.mapId, mapClusters.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'map_cluster_members_node_fk',
      columns: [t.mapId, t.nodeId],
      foreignColumns: [mapNodes.mapId, mapNodes.id],
    }).onDelete('cascade'),
  ],
);

/** Satu pola yang dicek untuk sebuah kelompok, terpenuhi atau tidak. */
export const mapClusterSignals = pgTable(
  'map_cluster_signals',
  {
    id: idColumn(),
    clusterId: refId('cluster_id')
      .notNull()
      .references(() => mapClusters.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** Nama pola, mis. "Pendana langsung yang sama". */
    label: text('label').notNull(),
    /** Penjelasan singkat hasil pengecekan. */
    detail: text('detail').notNull(),
    matched: boolean('matched').notNull(),
    /** Urutan tampil. */
    position: integer('position').notNull().default(0),
  },
  (t) => [unique('map_cluster_signals_cluster_key_unique').on(t.clusterId, t.key)],
);

/** Transfer tersimpan yang menjadi bukti sebuah sinyal kelompok. */
export const mapClusterSignalEvidence = pgTable(
  'map_cluster_signal_evidence',
  {
    id: idColumn(),
    signalId: refId('signal_id')
      .notNull()
      .references(() => mapClusterSignals.id, { onDelete: 'cascade' }),
    nativeTransferId: refId('native_transfer_id').references(() => nativeTransfers.id),
    tokenTransferId: refId('token_transfer_id').references(() => tokenTransfers.id),
  },
  (t) => [
    unique('map_cluster_signal_evidence_native_unique').on(t.signalId, t.nativeTransferId),
    unique('map_cluster_signal_evidence_token_unique').on(t.signalId, t.tokenTransferId),
    check('map_cluster_signal_evidence_one_transfer', sql`(${t.nativeTransferId} is null) <> (${t.tokenTransferId} is null)`),
  ],
);

/**
 * Kejadian yang tampak terkoordinasi: beberapa wallet melakukan hal serupa
 * di waktu yang sangat berdekatan. Selalu heuristic.
 */
export const coordinationEvents = pgTable(
  'coordination_events',
  {
    id: idColumn(),
    mapId: refId('map_id')
      .notNull()
      .references(() => walletMaps.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    kind: coordinationKind('kind').notNull(),
    /** Penjelasan singkat, mis. "5 wallet didanai dalam 9 menit". */
    detail: text('detail').notNull(),
    confidence: confidenceLevel('confidence').notNull(),
    classification: infoClassification('classification').notNull().default('heuristic'),
    heuristicName: text('heuristic_name').notNull(),
    /** Waktu transaksi pertama kejadian ini. */
    startedAt: timestampTz('started_at').notNull(),
    /** Rentang waktu kejadian dalam detik; 0 bila di blok yang sama. */
    windowSeconds: integer('window_seconds').notNull(),
    /** Diisi bila semua transaksinya di satu blok. */
    blockNumber: blockNumber('block_number'),
  },
  (t) => [
    unique('coordination_events_map_key_unique').on(t.mapId, t.key),
    unique('coordination_events_map_id_unique').on(t.mapId, t.id),
    check('coordination_events_is_heuristic', sql`${t.classification} = 'heuristic'`),
    check('coordination_events_window_non_negative', sql`${t.windowSeconds} >= 0`),
  ],
);

/** Wallet yang terlibat dalam kejadian koordinasi. */
export const coordinationEventMembers = pgTable(
  'coordination_event_members',
  {
    mapId: refId('map_id').notNull(),
    eventId: refId('event_id').notNull(),
    nodeId: refId('node_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'coordination_event_members_pk', columns: [t.eventId, t.nodeId] }),
    foreignKey({
      name: 'coordination_event_members_event_fk',
      columns: [t.mapId, t.eventId],
      foreignColumns: [coordinationEvents.mapId, coordinationEvents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'coordination_event_members_node_fk',
      columns: [t.mapId, t.nodeId],
      foreignColumns: [mapNodes.mapId, mapNodes.id],
    }).onDelete('cascade'),
  ],
);

/**
 * Transaksi pendukung kejadian koordinasi; tiap baris menunjuk transfer
 * tersimpan, jadi pihak, aset, jumlah, dan waktunya adalah fakta on-chain.
 */
export const coordinationTxs = pgTable(
  'coordination_txs',
  {
    id: idColumn(),
    eventId: refId('event_id')
      .notNull()
      .references(() => coordinationEvents.id, { onDelete: 'cascade' }),
    action: coordinationAction('action').notNull(),
    nativeTransferId: refId('native_transfer_id').references(() => nativeTransfers.id),
    tokenTransferId: refId('token_transfer_id').references(() => tokenTransfers.id),
  },
  (t) => [
    unique('coordination_txs_native_unique').on(t.eventId, t.nativeTransferId),
    unique('coordination_txs_token_unique').on(t.eventId, t.tokenTransferId),
    check('coordination_txs_one_transfer', sql`(${t.nativeTransferId} is null) <> (${t.tokenTransferId} is null)`),
  ],
);
