import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
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
import { dataStatus, riskLevel, tokenStandard } from './enums.js';
import { addresses, chains, providerRuns } from './reference.js';

/** Profil token. Metadata yang belum tersedia dibiarkan kosong, tidak ditebak. */
export const tokens = pgTable(
  'tokens',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    /** Address kontrak (EVM) atau mint (Solana). */
    addressId: refId('address_id').notNull(),
    standard: tokenStandard('standard').notNull(),
    name: text('name'),
    symbol: text('symbol'),
    decimals: smallint('decimals'),
    totalSupplyRaw: rawAmount('total_supply_raw'),
    deployerAddressId: refId('deployer_address_id').references(
      () => addresses.id,
    ),
    deployTxHash: text('deploy_tx_hash'),
    deployedAt: timestampTz('deployed_at'),
    /** Source code terverifikasi di explorer; `null` berarti belum diketahui. */
    sourceVerified: boolean('source_verified'),
    createdAt: timestampTz('created_at').notNull().defaultNow(),
    updatedAt: timestampTz('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('tokens_address_unique').on(t.addressId),
    // Address token wajib berada di chain yang sama dengan token.
    foreignKey({
      name: 'tokens_chain_address_fk',
      columns: [t.chainId, t.addressId],
      foreignColumns: [addresses.chainId, addresses.id],
    }),
    check(
      'tokens_decimals_range',
      sql`${t.decimals} is null or (${t.decimals} >= 0 and ${t.decimals} <= 255)`,
    ),
    check(
      'tokens_total_supply_non_negative',
      sql`${t.totalSupplyRaw} is null or ${t.totalSupplyRaw} >= 0`,
    ),
  ],
);

/**
 * Snapshot data token pada satu blok/slot. Investigasi yang dibuka ulang
 * memakai snapshot yang sama sehingga hasilnya bisa direproduksi.
 */
export const tokenSnapshots = pgTable(
  'token_snapshots',
  {
    id: idColumn(),
    tokenId: refId('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    blockNumber: blockNumber('block_number').notNull(),
    fetchedAt: timestampTz('fetched_at').notNull(),
    dataStatus: dataStatus('data_status').notNull(),
    priceUsd: numeric('price_usd', { precision: 38, scale: 18 }),
    priceChange24hPct: numeric('price_change_24h_pct', {
      precision: 12,
      scale: 4,
    }),
    marketCapUsd: usdAmount('market_cap_usd'),
    fdvUsd: usdAmount('fdv_usd'),
    liquidityUsd: usdAmount('liquidity_usd'),
    volume24hUsd: usdAmount('volume_24h_usd'),
    holderCount: integer('holder_count'),
    txCount24h: integer('tx_count_24h'),
    top10Pct: numeric('top10_pct', { precision: 7, scale: 4 }),
    top50Pct: numeric('top50_pct', { precision: 7, scale: 4 }),
    /** 0–100; kosong bila risiko belum bisa dinilai. */
    riskScore: smallint('risk_score'),
    riskLevel: riskLevel('risk_level').notNull().default('unknown'),
  },
  (t) => [
    unique('token_snapshots_token_block_unique').on(t.tokenId, t.blockNumber),
    check(
      'token_snapshots_pct_range',
      sql`(${t.top10Pct} is null or ${t.top10Pct} between 0 and 100)
        and (${t.top50Pct} is null or ${t.top50Pct} between 0 and 100)`,
    ),
    check(
      'token_snapshots_top10_within_top50',
      sql`${t.top10Pct} is null or ${t.top50Pct} is null or ${t.top10Pct} <= ${t.top50Pct}`,
    ),
    check(
      'token_snapshots_risk_score_range',
      sql`${t.riskScore} is null or ${t.riskScore} between 0 and 100`,
    ),
    check(
      'token_snapshots_unknown_risk_has_no_score',
      sql`(${t.riskLevel} = 'unknown') = (${t.riskScore} is null)`,
    ),
    check(
      'token_snapshots_counts_non_negative',
      sql`(${t.holderCount} is null or ${t.holderCount} >= 0)
        and (${t.txCount24h} is null or ${t.txCount24h} >= 0)`,
    ),
  ],
);

/** Provider yang dipakai untuk membentuk sebuah snapshot, untuk status provider. */
export const tokenSnapshotSources = pgTable(
  'token_snapshot_sources',
  {
    snapshotId: refId('snapshot_id')
      .notNull()
      .references(() => tokenSnapshots.id, { onDelete: 'cascade' }),
    providerRunId: refId('provider_run_id')
      .notNull()
      .references(() => providerRuns.id),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.providerRunId] })],
);

/** Saldo holder pada sebuah snapshot. */
export const holders = pgTable(
  'holders',
  {
    snapshotId: refId('snapshot_id')
      .notNull()
      .references(() => tokenSnapshots.id, { onDelete: 'cascade' }),
    addressId: refId('address_id')
      .notNull()
      .references(() => addresses.id),
    rank: integer('rank').notNull(),
    balanceRaw: rawAmount('balance_raw').notNull(),
    /** Persen dari total supply. */
    sharePct: numeric('share_pct', { precision: 9, scale: 6 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.snapshotId, t.addressId] }),
    unique('holders_snapshot_rank_unique').on(t.snapshotId, t.rank),
    check('holders_rank_positive', sql`${t.rank} >= 1`),
    check('holders_balance_non_negative', sql`${t.balanceRaw} >= 0`),
    check('holders_share_range', sql`${t.sharePct} between 0 and 100`),
  ],
);
