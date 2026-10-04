/**
 * Riwayat investigasi dan kasus. Aplikasi belum punya akun pengguna, jadi
 * semuanya milik satu workspace. Batas panjang teks sama dengan validasi di
 * frontend (catatan 280, judul kasus 120 karakter).
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { blockNumber, idColumn, refId, timestampTz } from './columns.js';
import { caseStatus, caseSubjectKind, dataStatus, infoClassification, investigationKind } from './enums.js';
import { addresses, chains } from './reference.js';

const HREF_PATTERN = `'^/(token|flow|trace|map|multichain)/'`;

/** Halaman investigasi yang pernah dibuka. Membuka ulang halaman yang sama memperbarui baris yang sama. */
export const investigations = pgTable(
  'investigations',
  {
    id: idColumn(),
    kind: investigationKind('kind').notNull(),
    title: text('title').notNull(),
    chainId: text('chain_id').references(() => chains.id),
    /** Tautan halaman di aplikasi, mis. `/token/base/0x…`; unik. */
    href: text('href').notNull(),
    /** Catatan singkat user; kosong bila belum ada. */
    note: text('note'),
    /** Jumlah temuan yang tercatat saat terakhir dibuka. */
    findingCount: integer('finding_count'),
    firstOpenedAt: timestampTz('first_opened_at').notNull(),
    openedAt: timestampTz('opened_at').notNull(),
    openCount: integer('open_count').notNull().default(1),
  },
  (t) => [
    unique('investigations_href_unique').on(t.href),
    index('investigations_opened_idx').on(t.openedAt),
    check('investigations_href_is_investigation', sql`${t.href} ~ ${sql.raw(HREF_PATTERN)} and starts_with(${t.href}, '/' || ${t.kind}::text || '/')`),
    check('investigations_title_not_blank', sql`length(btrim(${t.title})) > 0`),
    check('investigations_note_length', sql`${t.note} is null or (length(btrim(${t.note})) > 0 and length(${t.note}) <= 280)`),
    check('investigations_counts', sql`${t.openCount} >= 1 and (${t.findingCount} is null or ${t.findingCount} >= 0)`),
    check('investigations_opened_order', sql`${t.firstOpenedAt} <= ${t.openedAt}`),
  ],
);

/**
 * Kasus investigasi: entitas yang diselidiki, temuan beserta bukti hash
 * transaksinya, langkah investigasi, catatan, dan snapshot data supaya
 * hasilnya bisa direproduksi.
 */
export const cases = pgTable(
  'cases',
  {
    id: idColumn(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    status: caseStatus('status').notNull().default('open'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Kelengkapan data saat snapshot terakhir diambil. */
    dataStatus: dataStatus('data_status').notNull(),
    statusReason: text('status_reason'),
    /** Provider yang dipakai data kasus. */
    sources: text('sources')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    snapshotAt: timestampTz('snapshot_at').notNull(),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (t) => [
    index('cases_updated_idx').on(t.updatedAt),
    check('cases_title_length', sql`length(btrim(${t.title})) > 0 and length(${t.title}) <= 120`),
    check('cases_not_complete_is_explained', sql`${t.dataStatus} = 'complete' or ${t.statusReason} is not null`),
    check('cases_updated_order', sql`${t.createdAt} <= ${t.updatedAt}`),
  ],
);

/** Entitas yang diselidiki dalam kasus. */
export const caseSubjects = pgTable(
  'case_subjects',
  {
    id: idColumn(),
    caseId: refId('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    kind: caseSubjectKind('kind').notNull(),
    chainId: text('chain_id').references(() => chains.id),
    /** Identifier asli seperti yang disimpan. */
    address: text('address').notNull(),
    /** Bentuk ternormalisasi untuk mencegah duplikat dalam satu kasus. */
    addressNormalized: text('address_normalized').notNull(),
    /** Address tersimpan bila sudah pernah dicatat di chain itu. */
    addressId: refId('address_id'),
    title: text('title').notNull(),
    href: text('href').notNull(),
    addedAt: timestampTz('added_at').notNull(),
  },
  (t) => [
    unique('case_subjects_unique').on(t.caseId, t.kind, t.chainId, t.addressNormalized),
    foreignKey({ name: 'case_subjects_chain_address_fk', columns: [t.chainId, t.addressId], foreignColumns: [addresses.chainId, addresses.id] }),
    check('case_subjects_address_needs_chain', sql`${t.addressId} is null or ${t.chainId} is not null`),
  ],
);

/** Temuan kasus; setiap temuan wajib punya bukti hash transaksi (dijaga service). */
export const caseFindings = pgTable(
  'case_findings',
  {
    id: idColumn(),
    caseId: refId('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    /** Id temuan dari sumbernya, mis. id kelompok di peta; mencegah duplikat. */
    key: text('key').notNull(),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    classification: infoClassification('classification').notNull(),
    position: integer('position').notNull().default(0),
    addedAt: timestampTz('added_at').notNull(),
  },
  (t) => [
    unique('case_findings_key_unique').on(t.caseId, t.key),
    // Temuan kasus adalah klaim; "tidak tersedia" bukan temuan.
    check('case_findings_classification_is_claim', sql`${t.classification} <> 'unavailable'`),
  ],
);

/** Hash transaksi yang menjadi bukti sebuah temuan kasus. */
export const caseFindingEvidence = pgTable(
  'case_finding_evidence',
  {
    id: idColumn(),
    findingId: refId('finding_id')
      .notNull()
      .references(() => caseFindings.id, { onDelete: 'cascade' }),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    txHash: text('tx_hash').notNull(),
  },
  (t) => [unique('case_finding_evidence_unique').on(t.findingId, t.chainId, t.txHash), index('case_finding_evidence_tx_idx').on(t.chainId, t.txHash)],
);

/** Catatan pribadi di kasus. */
export const caseNotes = pgTable(
  'case_notes',
  {
    id: idColumn(),
    caseId: refId('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestampTz('created_at').notNull(),
  },
  (t) => [check('case_notes_body_length', sql`length(btrim(${t.body})) > 0 and length(${t.body}) <= 280`)],
);

/** Halaman investigasi yang dibuka untuk kasus ini. */
export const caseSteps = pgTable(
  'case_steps',
  {
    id: idColumn(),
    caseId: refId('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    kind: investigationKind('kind').notNull(),
    title: text('title').notNull(),
    chainId: text('chain_id').references(() => chains.id),
    href: text('href').notNull(),
    openedAt: timestampTz('opened_at').notNull(),
  },
  (t) => [
    unique('case_steps_href_unique').on(t.caseId, t.href),
    check('case_steps_href_is_investigation', sql`${t.href} ~ ${sql.raw(HREF_PATTERN)} and starts_with(${t.href}, '/' || ${t.kind}::text || '/')`),
  ],
);

/** Blok tiap chain yang dipakai snapshot kasus, supaya hasilnya bisa direproduksi. */
export const caseSnapshotBlocks = pgTable(
  'case_snapshot_blocks',
  {
    caseId: refId('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    blockNumber: blockNumber('block_number').notNull(),
  },
  (t) => [unique('case_snapshot_blocks_unique').on(t.caseId, t.chainId), check('case_snapshot_blocks_positive', sql`${t.blockNumber} >= 0`)],
);
