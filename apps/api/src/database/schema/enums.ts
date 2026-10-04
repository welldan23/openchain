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

export type ChainFamily = (typeof chainFamily.enumValues)[number];
export type DataStatus = (typeof dataStatus.enumValues)[number];
export type InfoClassification = (typeof infoClassification.enumValues)[number];
export type ProviderKind = (typeof providerKind.enumValues)[number];
export type EntityLabelType = (typeof entityLabelType.enumValues)[number];
export type CheckStatus = (typeof checkStatus.enumValues)[number];
export type ChainSupportStatus = (typeof chainSupportStatus.enumValues)[number];
export type NativeTransferKind = (typeof nativeTransferKind.enumValues)[number];
