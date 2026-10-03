import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import {
  blockNumber,
  idColumn,
  rawAmount,
  refId,
  timestampTz,
} from './columns.js';
import { checkStatus, infoClassification, riskSeverity } from './enums.js';
import { addresses, chains, labels, providerRuns } from './reference.js';
import { tokenSnapshots } from './tokens.js';

/**
 * Bukti yang mendukung setiap edge, heuristic, skor, dan label.
 * `evidence_key` dibentuk deterministik dari isi bukti, sehingga menyimpan
 * bukti yang sama berkali-kali tetap menghasilkan satu baris (idempotent).
 */
export const evidence = pgTable(
  'evidence',
  {
    id: idColumn(),
    evidenceKey: text('evidence_key').notNull().unique(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    classification: infoClassification('classification').notNull(),
    /** Penjelasan yang mudah dibaca manusia. */
    explanation: text('explanation').notNull(),
    txHash: text('tx_hash'),
    blockNumber: blockNumber('block_number'),
    blockTimestamp: timestampTz('block_timestamp'),
    logIndex: integer('log_index'),
    sourceAddressId: refId('source_address_id').references(() => addresses.id),
    destinationAddressId: refId('destination_address_id').references(
      () => addresses.id,
    ),
    /** Simbol native atau address token yang berpindah. */
    asset: text('asset'),
    amountRaw: rawAmount('amount_raw'),
    contractAddressId: refId('contract_address_id').references(
      () => addresses.id,
    ),
    /** Fungsi yang dipanggil bila berhasil di-decode. */
    method: text('method'),
    heuristicName: text('heuristic_name'),
    /** 0–1; wajib untuk heuristic. */
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    providerRunId: refId('provider_run_id').references(() => providerRuns.id),
    fetchedAt: timestampTz('fetched_at').notNull(),
  },
  (t) => [
    index('evidence_chain_tx_idx').on(t.chainId, t.txHash),
    check(
      'evidence_confidence_range',
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
    // Fakta terverifikasi harus bisa dicek: punya hash transaksi atau blok state.
    check(
      'evidence_fact_is_anchored',
      sql`${t.classification} <> 'verified_fact' or ${t.txHash} is not null or ${t.blockNumber} is not null`,
    ),
    check(
      'evidence_heuristic_is_explained',
      sql`${t.classification} <> 'heuristic' or (${t.heuristicName} is not null and ${t.confidence} is not null)`,
    ),
    check(
      'evidence_external_label_has_provider',
      sql`${t.classification} <> 'external_label' or ${t.providerRunId} is not null`,
    ),
    check(
      'evidence_amount_non_negative',
      sql`${t.amountRaw} is null or ${t.amountRaw} >= 0`,
    ),
  ],
);

/** Temuan risiko token pada sebuah snapshot. */
export const riskFindings = pgTable(
  'risk_findings',
  {
    id: idColumn(),
    snapshotId: refId('snapshot_id')
      .notNull()
      .references(() => tokenSnapshots.id, { onDelete: 'cascade' }),
    /** Kode stabil temuan, mis. `owner_can_change_tax`. */
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    severity: riskSeverity('severity').notNull(),
    classification: infoClassification('classification').notNull(),
  },
  (t) => [
    unique('risk_findings_snapshot_code_unique').on(t.snapshotId, t.code),
  ],
);

export const riskFindingEvidence = pgTable(
  'risk_finding_evidence',
  {
    findingId: refId('finding_id')
      .notNull()
      .references(() => riskFindings.id, { onDelete: 'cascade' }),
    evidenceId: refId('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.findingId, t.evidenceId] })],
);

/** Hasil pemeriksaan izin dan fungsi kontrak pada sebuah snapshot. */
export const contractChecks = pgTable(
  'contract_checks',
  {
    id: idColumn(),
    snapshotId: refId('snapshot_id')
      .notNull()
      .references(() => tokenSnapshots.id, { onDelete: 'cascade' }),
    /** Kode stabil pemeriksaan, mis. `tax` atau `mint_authority`. */
    code: text('code').notNull(),
    label: text('label').notNull(),
    status: checkStatus('status').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    /** Kosong hanya bila pemeriksaan belum dijalankan (status `unknown`). */
    classification: infoClassification('classification'),
  },
  (t) => [
    unique('contract_checks_snapshot_code_unique').on(t.snapshotId, t.code),
    check(
      'contract_checks_unknown_has_no_classification',
      sql`(${t.status} = 'unknown') = (${t.classification} is null)`,
    ),
  ],
);

export const contractCheckEvidence = pgTable(
  'contract_check_evidence',
  {
    checkId: refId('check_id')
      .notNull()
      .references(() => contractChecks.id, { onDelete: 'cascade' }),
    evidenceId: refId('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.checkId, t.evidenceId] })],
);

/** Bukti yang mendasari label heuristic sebuah address. */
export const labelEvidence = pgTable(
  'label_evidence',
  {
    labelId: refId('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    evidenceId: refId('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.labelId, t.evidenceId] })],
);
