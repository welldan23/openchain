/**
 * Penilaian risiko objek (token, wallet, kontrak) pada satu blok: skor,
 * alasan penilaian beserta poin dan hash buktinya, peringatan dini, dan ciri
 * berbahaya yang dipantau. Skor kosong berarti belum bisa dinilai, bukan aman.
 * Asumsi tidak pernah ikut dihitung ke skor (dijaga constraint).
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, primaryKey, smallint, text, unique } from 'drizzle-orm/pg-core';
import { blockNumber, idColumn, refId, timestampTz } from './columns.js';
import { dangerTrait, dangerTraitStatus, dataStatus, infoClassification, riskLevel, riskObjectKind, riskSeverity } from './enums.js';
import { evidence } from './evidence.js';
import { addresses, chains, providerRuns } from './reference.js';
import { tokenSnapshots } from './tokens.js';

/** Satu penilaian risiko untuk satu objek pada satu blok, dengan metode tertentu. */
export const riskAssessments = pgTable(
  'risk_assessments',
  {
    id: idColumn(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    addressId: refId('address_id').notNull(),
    objectKind: riskObjectKind('object_kind').notNull(),
    /** Snapshot token yang dipakai, untuk penilaian token. */
    tokenSnapshotId: refId('token_snapshot_id').references(() => tokenSnapshots.id, { onDelete: 'set null' }),
    /** Versi metode penilaian, mis. `openchain-risk-v1`, supaya skor lama tetap bisa dijelaskan. */
    methodology: text('methodology').notNull(),
    /** 0–100; kosong bila data belum cukup untuk menilai. */
    score: smallint('score'),
    level: riskLevel('level').notNull(),
    dataStatus: dataStatus('data_status').notNull(),
    statusReason: text('status_reason'),
    /** Blok/slot data yang dinilai. */
    blockNumber: blockNumber('block_number').notNull(),
    /** Waktu data diambil dari provider. */
    fetchedAt: timestampTz('fetched_at').notNull(),
    assessedAt: timestampTz('assessed_at').notNull(),
  },
  (t) => [
    unique('risk_assessments_object_block_unique').on(t.chainId, t.addressId, t.blockNumber, t.methodology),
    index('risk_assessments_object_idx').on(t.chainId, t.addressId, t.assessedAt),
    foreignKey({ name: 'risk_assessments_chain_address_fk', columns: [t.chainId, t.addressId], foreignColumns: [addresses.chainId, addresses.id] }),
    check('risk_assessments_score_range', sql`${t.score} is null or ${t.score} between 0 and 100`),
    check('risk_assessments_unknown_has_no_score', sql`(${t.level} = 'unknown') = (${t.score} is null)`),
    check('risk_assessments_not_complete_is_explained', sql`${t.dataStatus} = 'complete' or ${t.statusReason} is not null`),
    check('risk_assessments_token_snapshot_for_token', sql`${t.tokenSnapshotId} is null or ${t.objectKind} = 'token'`),
    check('risk_assessments_block_non_negative', sql`${t.blockNumber} >= 0`),
  ],
);

/** Provider yang dipakai sebuah penilaian. */
export const riskAssessmentSources = pgTable(
  'risk_assessment_sources',
  {
    assessmentId: refId('assessment_id')
      .notNull()
      .references(() => riskAssessments.id, { onDelete: 'cascade' }),
    providerRunId: refId('provider_run_id')
      .notNull()
      .references(() => providerRuns.id),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.providerRunId] })],
);

/** Alasan penilaian dan sumbangan poinnya ke skor. */
export const riskReasons = pgTable(
  'risk_reasons',
  {
    id: idColumn(),
    assessmentId: refId('assessment_id')
      .notNull()
      .references(() => riskAssessments.id, { onDelete: 'cascade' }),
    /** Kode stabil alasan, mis. `owner_can_change_tax`. */
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    severity: riskSeverity('severity').notNull(),
    classification: infoClassification('classification').notNull(),
    /** Poin untuk skor; kosong bila tidak ikut dihitung. */
    points: smallint('points'),
    position: smallint('position').notNull().default(0),
  },
  (t) => [
    unique('risk_reasons_assessment_code_unique').on(t.assessmentId, t.code),
    // Dipakai foreign key komposit supaya ciri hanya merujuk alasan di penilaian yang sama.
    unique('risk_reasons_assessment_id_unique').on(t.assessmentId, t.id),
    check('risk_reasons_points_range', sql`${t.points} is null or ${t.points} between 0 and 100`),
    // Klaim tanpa bukti on-chain tidak boleh menaikkan skor.
    check('risk_reasons_assumption_not_counted', sql`${t.classification} <> 'assumption' or ${t.points} is null`),
    check('risk_reasons_classification_is_claim', sql`${t.classification} <> 'unavailable'`),
  ],
);

/** Hash transaksi yang menjadi bukti sebuah alasan; `evidence_id` bila ada catatan bukti lengkapnya. */
export const riskReasonEvidence = pgTable(
  'risk_reason_evidence',
  {
    id: idColumn(),
    reasonId: refId('reason_id')
      .notNull()
      .references(() => riskReasons.id, { onDelete: 'cascade' }),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    txHash: text('tx_hash').notNull(),
    evidenceId: refId('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),
  },
  (t) => [unique('risk_reason_evidence_unique').on(t.reasonId, t.chainId, t.txHash), index('risk_reason_evidence_tx_idx').on(t.chainId, t.txHash)],
);

/** Peringatan dini: pola baru yang perlu dipantau, terikat satu ciri berbahaya. */
export const riskWarnings = pgTable(
  'risk_warnings',
  {
    id: idColumn(),
    assessmentId: refId('assessment_id')
      .notNull()
      .references(() => riskAssessments.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    trait: dangerTrait('trait').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    severity: riskSeverity('severity').notNull(),
    classification: infoClassification('classification').notNull(),
    detectedAt: timestampTz('detected_at').notNull(),
  },
  (t) => [
    unique('risk_warnings_assessment_code_unique').on(t.assessmentId, t.code),
    unique('risk_warnings_assessment_id_unique').on(t.assessmentId, t.id),
    check('risk_warnings_classification_is_claim', sql`${t.classification} <> 'unavailable'`),
  ],
);

export const riskWarningEvidence = pgTable(
  'risk_warning_evidence',
  {
    id: idColumn(),
    warningId: refId('warning_id')
      .notNull()
      .references(() => riskWarnings.id, { onDelete: 'cascade' }),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    txHash: text('tx_hash').notNull(),
    evidenceId: refId('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),
  },
  (t) => [unique('risk_warning_evidence_unique').on(t.warningId, t.chainId, t.txHash), index('risk_warning_evidence_tx_idx').on(t.chainId, t.txHash)],
);

/**
 * Hasil pemantauan satu ciri berbahaya. `detected` wajib merujuk alasan atau
 * peringatan, atau punya keterangan; `clear` dan `unknown` wajib berketerangan.
 */
export const riskTraitChecks = pgTable(
  'risk_trait_checks',
  {
    assessmentId: refId('assessment_id')
      .notNull()
      .references(() => riskAssessments.id, { onDelete: 'cascade' }),
    trait: dangerTrait('trait').notNull(),
    status: dangerTraitStatus('status').notNull(),
    note: text('note'),
    reasonId: refId('reason_id'),
    warningId: refId('warning_id'),
  },
  (t) => [
    primaryKey({ columns: [t.assessmentId, t.trait] }),
    foreignKey({ name: 'risk_trait_checks_reason_fk', columns: [t.assessmentId, t.reasonId], foreignColumns: [riskReasons.assessmentId, riskReasons.id] }),
    foreignKey({ name: 'risk_trait_checks_warning_fk', columns: [t.assessmentId, t.warningId], foreignColumns: [riskWarnings.assessmentId, riskWarnings.id] }),
    check(
      'risk_trait_checks_detected_is_backed',
      sql`${t.status} <> 'detected' or ${t.reasonId} is not null or ${t.warningId} is not null or ${t.note} is not null`,
    ),
    check('risk_trait_checks_other_is_explained', sql`${t.status} = 'detected' or ${t.note} is not null`),
    check('risk_trait_checks_reference_only_when_detected', sql`${t.status} = 'detected' or (${t.reasonId} is null and ${t.warningId} is null)`),
  ],
);
