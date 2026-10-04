import { pgEnum } from 'drizzle-orm/pg-core';

/** Keluarga chain menentukan format address, hash, dan model data adapter. */
export const chainFamily = pgEnum('chain_family', [
  'evm',
  'solana',
  'bitcoin',
  'tron',
  'ton',
]);

/**
 * Status dukungan chain. Chain hanya boleh disebut didukung (`validated`)
 * setelah adapter tersedia dan smoke test lulus.
 */
export const chainSupportStatus = pgEnum('chain_support_status', [
  'planned',
  'experimental',
  'validated',
]);

/** Kelengkapan data dari sebuah pengambilan provider atau snapshot. */
export const dataStatus = pgEnum('data_status', [
  'complete',
  'partial',
  'unavailable',
  'stale',
]);

/** Jenis provider sesuai abstraksi di PRD. */
export const providerKind = pgEnum('provider_kind', [
  'rpc',
  'explorer',
  'indexed_data',
  'market_data',
  'entity_label',
  'security',
]);

/**
 * Kemampuan data per chain. Status tiap kemampuan dicatat terpisah karena satu
 * chain bisa punya RPC yang sehat tapi belum punya indexer holder.
 */
export const chainCapability = pgEnum('chain_capability', [
  'token_snapshot',
  'holders',
  'contract_info',
  'market_data',
  'contract_security',
  'fund_flow',
  'internal_traces',
  'multichain_profile',
]);

/** Klasifikasi informasi: dari fakta terverifikasi sampai data yang tidak tersedia. */
export const infoClassification = pgEnum('info_classification', [
  'verified_fact',
  'derived_metric',
  'heuristic',
  'external_label',
  'assumption',
  'unavailable',
]);

/** Asal label entitas. Label dari user diperlakukan sebagai asumsi. */
export const labelSource = pgEnum('label_source', [
  'external',
  'heuristic',
  'user',
]);

export const entityLabelType = pgEnum('entity_label_type', [
  'exchange',
  'router',
  'bridge',
  'market_maker',
  'treasury',
  'bot',
  'whale',
  'deployer',
  'liquidity_pool',
  'launchpad',
  'faucet',
  'infrastructure',
  'burn',
  'unknown',
]);

export const tokenStandard = pgEnum('token_standard', [
  'erc20',
  'spl',
  'spl_token_2022',
]);

export const riskSeverity = pgEnum('risk_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

/** `unknown`: data belum cukup untuk menilai risiko. */
export const riskLevel = pgEnum('risk_level', [
  'unknown',
  'low',
  'medium',
  'high',
  'critical',
]);

/** Hasil satu pemeriksaan kontrak. */
export const checkStatus = pgEnum('check_status', [
  'fail',
  'warn',
  'unknown',
  'pass',
]);

export const tradingEventType = pgEnum('trading_event_type', [
  'deploy',
  'mint',
  'add_liquidity',
  'remove_liquidity',
  'buy',
  'sell',
  'transfer',
  'burn',
]);

/**
 * Asal perpindahan native coin: nilai yang dikirim transaksi itu sendiri,
 * atau panggilan internal kontrak (butuh trace dari node/indexer).
 */
export const nativeTransferKind = pgEnum('native_transfer_kind', [
  'transaction',
  'internal',
]);

/**
 * Jenis perpindahan dana menurut pihak yang terlibat. `transfer` = tidak ada
 * petunjuk khusus; jenis lain didasarkan pada address nol atau label pihaknya.
 */
export const movementType = pgEnum('movement_type', [
  'transfer',
  'mint',
  'burn',
  'exchange_deposit',
  'exchange_withdrawal',
  'bridge_out',
  'bridge_in',
  'dex_interaction',
]);

/** Jenis hubungan di peta: pendanaan (native atau stablecoin) atau transfer token yang dipetakan. */
export const mapEdgeKind = pgEnum('map_edge_kind', ['funding', 'token_transfer']);

/** Peran wallet di peta. `connector` = bukan holder, muncul karena menghubungkan holder. */
export const mapNodeRole = pgEnum('map_node_role', ['holder', 'funder', 'connector']);

/**
 * Label kelompok wallet sesuai PRD. Semuanya hasil heuristic; insider/team
 * hanya boleh dipakai bila ada bukti transaksi langsung.
 */
export const clusterLabel = pgEnum('cluster_label', [
  'visual_cluster',
  'common_funding',
  'coordinated_execution',
  'bundled_or_sniper_activity',
  'market_maker_possible',
  'likely_linked',
  'insider_or_team',
  'false_positive_possible',
  'inconclusive',
]);

/** Tingkat keyakinan dugaan dalam bahasa sederhana. */
export const confidenceLevel = pgEnum('confidence_level', ['low', 'medium', 'high']);

/** Jenis gerak serempak yang dideteksi di antara wallet peta. */
export const coordinationKind = pgEnum('coordination_kind', ['funding_burst', 'same_block_buy', 'similar_amount', 'coordinated_sell']);

/** Aksi transaksi pendukung temuan koordinasi. */
export const coordinationAction = pgEnum('coordination_action', ['funding', 'buy', 'sell', 'add_liquidity', 'transfer']);

export type ChainFamily = (typeof chainFamily.enumValues)[number];
export type DataStatus = (typeof dataStatus.enumValues)[number];
export type InfoClassification = (typeof infoClassification.enumValues)[number];
export type ProviderKind = (typeof providerKind.enumValues)[number];
export type EntityLabelType = (typeof entityLabelType.enumValues)[number];
export type CheckStatus = (typeof checkStatus.enumValues)[number];
export type ChainSupportStatus = (typeof chainSupportStatus.enumValues)[number];
export type ChainCapability = (typeof chainCapability.enumValues)[number];
export type NativeTransferKind = (typeof nativeTransferKind.enumValues)[number];
export type MovementType = (typeof movementType.enumValues)[number];
export type MapEdgeKind = (typeof mapEdgeKind.enumValues)[number];
export type MapNodeRole = (typeof mapNodeRole.enumValues)[number];
export type ClusterLabel = (typeof clusterLabel.enumValues)[number];
export type ConfidenceLevel = (typeof confidenceLevel.enumValues)[number];
export type CoordinationKind = (typeof coordinationKind.enumValues)[number];
export type CoordinationAction = (typeof coordinationAction.enumValues)[number];
