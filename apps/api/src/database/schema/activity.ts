import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
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
import { tradingEventType } from './enums.js';
import { addresses, chains, providerRuns } from './reference.js';
import { tokens } from './tokens.js';

/** Transaksi on-chain. Hash disimpan dalam bentuk ternormalisasi per chain. */
export const transactions = pgTable(
  'transactions',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    hash: text('hash').notNull(),
    blockNumber: blockNumber('block_number').notNull(),
    blockTimestamp: timestampTz('block_timestamp').notNull(),
    fromAddressId: refId('from_address_id').references(() => addresses.id),
    toAddressId: refId('to_address_id').references(() => addresses.id),
    /** Nilai native yang dikirim (wei/lamport). */
    valueRaw: rawAmount('value_raw'),
    /** Nama fungsi bila calldata berhasil di-decode. */
    method: text('method'),
    success: boolean('success'),
    providerRunId: refId('provider_run_id').references(() => providerRuns.id),
    fetchedAt: timestampTz('fetched_at').notNull(),
  },
  (t) => [
    unique('transactions_chain_hash_unique').on(t.chainId, t.hash),
    index('transactions_chain_block_idx').on(t.chainId, t.blockNumber),
    check(
      'transactions_value_non_negative',
      sql`${t.valueRaw} is null or ${t.valueRaw} >= 0`,
    ),
  ],
);

/**
 * Transfer token (event log). Tidak memakai foreign key ke `transactions`
 * supaya transfer tetap bisa disimpan walau detail transaksinya belum diambil.
 */
export const tokenTransfers = pgTable(
  'token_transfers',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    txHash: text('tx_hash').notNull(),
    /** Log index (EVM) atau urutan instruksi (Solana). */
    logIndex: integer('log_index').notNull(),
    tokenId: refId('token_id')
      .notNull()
      .references(() => tokens.id),
    fromAddressId: refId('from_address_id')
      .notNull()
      .references(() => addresses.id),
    toAddressId: refId('to_address_id')
      .notNull()
      .references(() => addresses.id),
    amountRaw: rawAmount('amount_raw').notNull(),
    blockNumber: blockNumber('block_number').notNull(),
    blockTimestamp: timestampTz('block_timestamp').notNull(),
    providerRunId: refId('provider_run_id').references(() => providerRuns.id),
    fetchedAt: timestampTz('fetched_at').notNull(),
  },
  (t) => [
    unique('token_transfers_chain_tx_log_unique').on(
      t.chainId,
      t.txHash,
      t.logIndex,
    ),
    index('token_transfers_token_block_idx').on(t.tokenId, t.blockNumber),
    check('token_transfers_log_index_non_negative', sql`${t.logIndex} >= 0`),
    check('token_transfers_amount_non_negative', sql`${t.amountRaw} >= 0`),
  ],
);

/** Peristiwa penting token untuk panel aktivitas: beli, jual, likuiditas, dll. */
export const tradingEvents = pgTable(
  'trading_events',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    txHash: text('tx_hash').notNull(),
    /** Kosong untuk peristiwa tingkat transaksi, mis. deploy. */
    logIndex: integer('log_index'),
    type: tradingEventType('type').notNull(),
    tokenId: refId('token_id')
      .notNull()
      .references(() => tokens.id),
    fromAddressId: refId('from_address_id').references(() => addresses.id),
    toAddressId: refId('to_address_id').references(() => addresses.id),
    amountRaw: rawAmount('amount_raw').notNull(),
    amountUsd: usdAmount('amount_usd'),
    /** Nama DEX bila peristiwa terjadi di pool, mis. "Uniswap V2". */
    dex: text('dex'),
    pairAddressId: refId('pair_address_id').references(() => addresses.id),
    blockNumber: blockNumber('block_number').notNull(),
    blockTimestamp: timestampTz('block_timestamp').notNull(),
    providerRunId: refId('provider_run_id').references(() => providerRuns.id),
    fetchedAt: timestampTz('fetched_at').notNull(),
  },
  (t) => [
    // NULLS NOT DISTINCT: peristiwa tingkat transaksi (log_index kosong)
    // tetap tidak boleh tercatat dua kali.
    unique('trading_events_identity_unique')
      .on(t.chainId, t.txHash, t.logIndex, t.type)
      .nullsNotDistinct(),
    index('trading_events_token_time_idx').on(t.tokenId, t.blockTimestamp),
    check('trading_events_amount_non_negative', sql`${t.amountRaw} >= 0`),
  ],
);
