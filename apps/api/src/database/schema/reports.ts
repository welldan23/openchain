/**
 * Laporan bukti: dokumen investigasi yang biasanya disusun dari satu kasus.
 * Isinya bagian berurutan, dan tiap bagian berisi blok (paragraf, klaim,
 * bukti tersemat, catatan, entitas). Klaim menyimpan provider dan waktu
 * datanya beserta hash buktinya; nilai yang kosong ditandai di panel
 * kesiapan, tidak diisi tebakan. Entitas dan judul kasus disalin supaya
 * laporan tetap utuh bila kasusnya berubah atau dihapus. Batas panjang teks
 * sama dengan validasi di frontend (catatan 280 karakter).
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, unique, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { blockNumber, idColumn, refId, timestampTz } from './columns.js';
import { caseSubjectKind, dataStatus, infoClassification, reportBlockKind, reportStatus } from './enums.js';
import { cases } from './investigations.js';
import { chains } from './reference.js';

export const reports = pgTable(
  'reports',
  {
    id: idColumn(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    status: reportStatus('status').notNull().default('draft'),
    /** Kasus sumber; kosong bila laporan dibuat sendiri atau kasusnya dihapus. */
    caseId: refId('case_id').references(() => cases.id, { onDelete: 'set null' }),
    /** Judul kasus sumber saat laporan disusun. */
    sourceTitle: text('source_title'),
    /** Kelengkapan data snapshot laporan. */
    dataStatus: dataStatus('data_status').notNull(),
    statusReason: text('status_reason'),
    /** Provider yang dipakai data laporan. */
    sources: text('sources')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    snapshotAt: timestampTz('snapshot_at').notNull(),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
    /** Waktu laporan difinalkan; wajib ada tepat saat status `final`. */
    finalizedAt: timestampTz('finalized_at'),
  },
  (t) => [
    index('reports_updated_idx').on(t.updatedAt),
    index('reports_case_idx').on(t.caseId),
    check('reports_title_length', sql`length(btrim(${t.title})) > 0 and length(${t.title}) <= 160`),
    check('reports_summary_length', sql`length(${t.summary}) <= 2000`),
    check('reports_not_complete_is_explained', sql`${t.dataStatus} = 'complete' or ${t.statusReason} is not null`),
    check('reports_updated_order', sql`${t.createdAt} <= ${t.updatedAt}`),
    check('reports_finalized_when_final', sql`(${t.status} = 'final') = (${t.finalizedAt} is not null)`),
    check('reports_source_title_needs_text', sql`${t.sourceTitle} is null or length(btrim(${t.sourceTitle})) > 0`),
  ],
);

/** Blok tiap chain yang dipakai snapshot laporan, supaya hasilnya bisa direproduksi. */
export const reportSnapshotBlocks = pgTable(
  'report_snapshot_blocks',
  {
    reportId: refId('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    blockNumber: blockNumber('block_number').notNull(),
  },
  (t) => [unique('report_snapshot_blocks_unique').on(t.reportId, t.chainId), check('report_snapshot_blocks_positive', sql`${t.blockNumber} >= 0`)],
);

/** Bagian laporan, berurutan menurut `position`. */
export const reportSections = pgTable(
  'report_sections',
  {
    id: idColumn(),
    reportId: refId('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    // Dipakai foreign key komposit supaya blok hanya masuk bagian di laporan yang sama.
    unique('report_sections_report_id_unique').on(t.reportId, t.id),
    index('report_sections_order_idx').on(t.reportId, t.position),
    check('report_sections_title_length', sql`length(btrim(${t.title})) > 0 and length(${t.title}) <= 160`),
  ],
);

/**
 * Blok isi laporan. Satu tabel untuk semua jenis; kolom yang dipakai tiap
 * jenis dijaga constraint, dan kolom milik jenis lain wajib kosong.
 *
 * - `paragraph`: `body`.
 * - `claim`: `title`, `body` (rincian), `classification`, `provider` dan
 *   `observed_at` (boleh kosong, ditandai belum siap), hash bukti di
 *   `report_claim_evidence`.
 * - `evidence`: `chain_id`, `tx_hash`, `caption`.
 * - `note`: `body` (maks. 280), `edited_at`, dan `claim_block_id` bila
 *   membahas sebuah klaim.
 * - `entity`: salinan subjek kasus: `entity_kind`, `chain_id`, `address`,
 *   `title`, `href`.
 *
 * Klaim dan entitas yang disusun dari kasus atau penilaian risiko menyimpan
 * asalnya di `source_key`.
 */
export const reportBlocks = pgTable(
  'report_blocks',
  {
    id: idColumn(),
    reportId: refId('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    sectionId: refId('section_id').notNull(),
    kind: reportBlockKind('kind').notNull(),
    position: integer('position').notNull().default(0),
    title: text('title'),
    body: text('body'),
    classification: infoClassification('classification'),
    provider: text('provider'),
    observedAt: timestampTz('observed_at'),
    chainId: text('chain_id').references(() => chains.id),
    txHash: text('tx_hash'),
    caption: text('caption'),
    entityKind: caseSubjectKind('entity_kind'),
    address: text('address'),
    href: text('href'),
    claimBlockId: refId('claim_block_id').references((): AnyPgColumn => reportBlocks.id, { onDelete: 'set null' }),
    /**
     * Asal blok yang disusun otomatis, mis. `case:<id temuan>`,
     * `risk:<chain>:<address>:reason:<kode>`, atau `subject:<kunci subjek>`;
     * mencegah temuan atau entitas yang sama masuk dua kali.
     */
    sourceKey: text('source_key'),
    createdAt: timestampTz('created_at').notNull(),
    editedAt: timestampTz('edited_at'),
  },
  (t) => [
    foreignKey({ name: 'report_blocks_section_fk', columns: [t.reportId, t.sectionId], foreignColumns: [reportSections.reportId, reportSections.id] }).onDelete('cascade'),
    index('report_blocks_order_idx').on(t.sectionId, t.position),
    unique('report_blocks_source_unique').on(t.reportId, t.sourceKey),
    check('report_blocks_source_kind', sql`${t.sourceKey} is null or (${t.kind} in ('claim', 'entity') and length(${t.sourceKey}) between 1 and 300)`),
    index('report_blocks_tx_idx').on(t.chainId, t.txHash),
    check('report_blocks_paragraph', sql`${t.kind} <> 'paragraph' or (${t.body} is not null and length(${t.body}) <= 5000)`),
    check(
      'report_blocks_claim',
      sql`${t.kind} <> 'claim' or (${t.title} is not null and length(btrim(${t.title})) > 0 and length(${t.title}) <= 200 and ${t.body} is not null and length(${t.body}) <= 2000 and ${t.classification} is not null)`,
    ),
    // Klaim adalah pernyataan; "tidak tersedia" bukan klaim.
    check('report_blocks_claim_is_claim', sql`${t.classification} is null or ${t.classification} <> 'unavailable'`),
    check('report_blocks_claim_provider_text', sql`${t.provider} is null or length(btrim(${t.provider})) > 0`),
    check(
      'report_blocks_evidence',
      sql`${t.kind} <> 'evidence' or (${t.chainId} is not null and ${t.txHash} is not null and ${t.caption} is not null and length(${t.caption}) <= 500)`,
    ),
    check('report_blocks_note', sql`${t.kind} <> 'note' or (${t.body} is not null and length(btrim(${t.body})) > 0 and length(${t.body}) <= 280)`),
    check(
      'report_blocks_entity',
      sql`${t.kind} <> 'entity' or (${t.entityKind} is not null and ${t.address} is not null and ${t.title} is not null and length(btrim(${t.title})) > 0 and ${t.href} is not null and ${t.href} ~ '^/(token|flow|multichain)/')`,
    ),
    check('report_blocks_entity_token_has_chain', sql`${t.entityKind} is distinct from 'token' or ${t.chainId} is not null`),
    // Kolom milik jenis lain wajib kosong.
    check('report_blocks_claim_fields', sql`${t.kind} = 'claim' or (${t.classification} is null and ${t.provider} is null and ${t.observedAt} is null)`),
    check('report_blocks_title_fields', sql`${t.kind} in ('claim', 'entity') or ${t.title} is null`),
    check('report_blocks_body_fields', sql`${t.kind} in ('paragraph', 'claim', 'note') or ${t.body} is null`),
    check('report_blocks_chain_fields', sql`${t.kind} in ('evidence', 'entity') or ${t.chainId} is null`),
    check('report_blocks_evidence_fields', sql`${t.kind} = 'evidence' or (${t.txHash} is null and ${t.caption} is null)`),
    check('report_blocks_entity_fields', sql`${t.kind} = 'entity' or (${t.entityKind} is null and ${t.address} is null and ${t.href} is null)`),
    check('report_blocks_note_fields', sql`${t.kind} = 'note' or (${t.claimBlockId} is null and ${t.editedAt} is null)`),
    check('report_blocks_edited_order', sql`${t.editedAt} is null or ${t.editedAt} >= ${t.createdAt}`),
  ],
);

/** Hash transaksi yang menjadi bukti sebuah klaim laporan. */
export const reportClaimEvidence = pgTable(
  'report_claim_evidence',
  {
    id: idColumn(),
    blockId: refId('block_id')
      .notNull()
      .references(() => reportBlocks.id, { onDelete: 'cascade' }),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    txHash: text('tx_hash').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [unique('report_claim_evidence_unique').on(t.blockId, t.chainId, t.txHash), index('report_claim_evidence_tx_idx').on(t.chainId, t.txHash)],
);

/**
 * Tautan berbagi publik laporan. Token mentah hanya ditunjukkan sekali saat
 * dibuat; yang disimpan hanya hash SHA-256-nya dan awalan pendek untuk
 * dikenali. Tautan bisa kedaluwarsa atau dicabut.
 */
export const reportShareLinks = pgTable(
  'report_share_links',
  {
    id: idColumn(),
    reportId: refId('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    /** SHA-256 heksadesimal dari token. */
    tokenHash: text('token_hash').notNull(),
    /** Beberapa karakter awal token, untuk mengenali tautan di daftar. */
    tokenPrefix: text('token_prefix').notNull(),
    createdAt: timestampTz('created_at').notNull(),
    expiresAt: timestampTz('expires_at'),
    revokedAt: timestampTz('revoked_at'),
    lastViewedAt: timestampTz('last_viewed_at'),
    viewCount: integer('view_count').notNull().default(0),
  },
  (t) => [
    unique('report_share_links_token_unique').on(t.tokenHash),
    index('report_share_links_report_idx').on(t.reportId),
    check('report_share_links_hash_format', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('report_share_links_prefix_length', sql`length(${t.tokenPrefix}) between 4 and 12`),
    check('report_share_links_expiry_order', sql`${t.expiresAt} is null or ${t.expiresAt} > ${t.createdAt}`),
    check('report_share_links_revoked_order', sql`${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt}`),
    check('report_share_links_views', sql`${t.viewCount} >= 0`),
  ],
);
