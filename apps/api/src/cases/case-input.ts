/**
 * Validasi isi permintaan kasus. Batasnya sama dengan frontend dan constraint
 * database. Temuan tanpa hash bukti ditolak: temuan kasus wajib bisa
 * ditelusuri ke transaksi.
 */
import { caseStatus, investigationKind, type CaseStatus, type CaseSubjectKind, type InfoClassification, type InvestigationKind } from '../database/schema/enums.js';
import { parseNote } from '../investigations/investigation-input.js';

export const CASE_TITLE_MAX = 120;
export const SUMMARY_MAX = 2_000;
export const MAX_TAGS = 10;
export const TAG_MAX = 32;
export const MAX_FINDINGS = 50;
export const MAX_EVIDENCE_PER_FINDING = 50;

export class CaseInputError extends Error {}

export interface SubjectInput {
  kind: CaseSubjectKind;
  chain: string | null;
  address: string;
  title: string;
  href: string;
}

export interface FindingInput {
  key: string;
  title: string;
  detail: string;
  classification: InfoClassification;
  /** Chain bukti; bila kosong dipakai chain subjek. */
  chain: string | null;
  evidenceTxHashes: string[];
}

export interface StepInput {
  kind: InvestigationKind;
  title: string;
  chain: string | null;
  href: string;
}

export interface CaseItemsInput {
  subject: SubjectInput | null;
  findings: FindingInput[];
  note: string | null;
  step: StepInput | null;
}

export interface NewCaseInput extends CaseItemsInput {
  title: string;
  summary: string;
  tags: string[];
}

export interface CaseUpdateInput {
  title?: string;
  summary?: string;
  status?: CaseStatus;
  tags?: string[];
}

/** Istilah frontend diterima juga: `fact` dan `calculation`. */
const CLASSIFICATIONS: Record<string, InfoClassification> = {
  verified_fact: 'verified_fact',
  fact: 'verified_fact',
  derived_metric: 'derived_metric',
  calculation: 'derived_metric',
  heuristic: 'heuristic',
  external_label: 'external_label',
  assumption: 'assumption',
};
const CHAIN = /^[a-z0-9-]+$/;
const HASH = /^[0-9A-Za-z]{32,128}$|^0x[0-9a-fA-F]{64}$/;
const SUBJECT_HREF = /^\/(token|flow|multichain)\/[^\s]{1,500}$/;
const STEP_HREF = /^\/(token|flow|trace|map|multichain)\/[^\s]{1,500}$/;

function record(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new CaseInputError(`${what} harus objek JSON.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, what: string, max: number, required = true): string {
  if (value === undefined || value === null) {
    if (required) throw new CaseInputError(`${what} wajib diisi.`);
    return '';
  }
  if (typeof value !== 'string') throw new CaseInputError(`${what} harus berupa teks.`);
  const trimmed = value.trim();
  if (required && trimmed === '') throw new CaseInputError(`${what} wajib diisi.`);
  if (trimmed.length > max) throw new CaseInputError(`${what} maksimal ${max} karakter (sekarang ${trimmed.length}).`);
  return trimmed;
}

function chain(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !CHAIN.test(value)) throw new CaseInputError('Chain tidak valid.');
  return value;
}

export function parseTitle(value: unknown): string {
  return text(value, 'Judul kasus', CASE_TITLE_MAX);
}

export function parseTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new CaseInputError('Tag harus berupa daftar teks.');
  const tags = [...new Set(value.map((item) => text(item, 'Tag', TAG_MAX).toLowerCase()))];
  if (tags.length > MAX_TAGS) throw new CaseInputError(`Tag maksimal ${MAX_TAGS}.`);
  return tags;
}

function parseSubject(value: unknown): SubjectInput | null {
  if (value === undefined || value === null) return null;
  const body = record(value, 'Subjek');
  if (body.kind !== 'token' && body.kind !== 'address') throw new CaseInputError('Jenis subjek harus token atau address.');
  const href = text(body.href, 'Tautan subjek', 600);
  if (!SUBJECT_HREF.test(href)) throw new CaseInputError('Tautan subjek harus ke halaman token, aliran dana, atau multichain.');
  const subjectChain = chain(body.chain);
  if (body.kind === 'token' && subjectChain === null) throw new CaseInputError('Subjek token wajib menyebut chain.');
  return { kind: body.kind, chain: subjectChain, address: text(body.address, 'Address subjek', 128), title: text(body.title, 'Judul subjek', 200), href };
}

function parseFinding(value: unknown): FindingInput {
  const body = record(value, 'Temuan');
  const classification = CLASSIFICATIONS[String(body.classification)];
  if (!classification) throw new CaseInputError(`Klasifikasi temuan tidak dikenal: ${String(body.classification)}.`);
  const hashes = body.evidenceTxHashes;
  if (!Array.isArray(hashes) || hashes.length === 0) {
    throw new CaseInputError('Ada temuan tanpa hash bukti. Temuan kasus wajib bisa ditelusuri ke transaksi.');
  }
  if (hashes.length > MAX_EVIDENCE_PER_FINDING) throw new CaseInputError(`Bukti per temuan maksimal ${MAX_EVIDENCE_PER_FINDING} hash.`);
  const evidenceTxHashes = [
    ...new Set(
      hashes.map((hash) => {
        if (typeof hash !== 'string' || !HASH.test(hash.trim())) throw new CaseInputError('Hash bukti tidak valid.');
        const trimmed = hash.trim();
        return trimmed.startsWith('0x') ? trimmed.toLowerCase() : trimmed;
      }),
    ),
  ];
  return {
    key: text(body.id ?? body.key, 'Id temuan', 120),
    title: text(body.title, 'Judul temuan', 200),
    detail: text(body.detail, 'Detail temuan', 2_000, false),
    classification,
    chain: chain(body.chain),
    evidenceTxHashes,
  };
}

function parseStep(value: unknown): StepInput | null {
  if (value === undefined || value === null) return null;
  const body = record(value, 'Langkah');
  const kind = String(body.kind);
  if (!(investigationKind.enumValues as readonly string[]).includes(kind)) throw new CaseInputError('Jenis langkah investigasi tidak dikenal.');
  const href = text(body.href, 'Tautan langkah', 600);
  if (!STEP_HREF.test(href) || !href.startsWith(`/${kind}/`)) throw new CaseInputError('Tautan langkah harus ke halaman investigasi yang jenisnya cocok.');
  return { kind: kind as InvestigationKind, title: text(body.title, 'Judul langkah', 200), chain: chain(body.chain), href };
}

export function parseItems(value: unknown): CaseItemsInput {
  const body = record(value, 'Isi permintaan');
  const findings = body.findings === undefined || body.findings === null ? [] : body.findings;
  if (!Array.isArray(findings)) throw new CaseInputError('Temuan harus berupa daftar.');
  if (findings.length > MAX_FINDINGS) throw new CaseInputError(`Temuan per permintaan maksimal ${MAX_FINDINGS}.`);
  let note: string | null;
  try {
    note = parseNote(body.note);
  } catch (error) {
    throw new CaseInputError(error instanceof Error ? error.message : 'Catatan tidak valid.');
  }
  return { subject: parseSubject(body.subject), findings: findings.map(parseFinding), note, step: parseStep(body.step) };
}

export function parseNewCase(value: unknown): NewCaseInput {
  const body = record(value, 'Isi permintaan');
  return {
    ...parseItems(body),
    title: parseTitle(body.title),
    summary: text(body.summary, 'Ringkasan', SUMMARY_MAX, false),
    tags: parseTags(body.tags),
  };
}

export function parseUpdate(value: unknown): CaseUpdateInput {
  const body = record(value, 'Isi permintaan');
  const update: CaseUpdateInput = {};
  if (body.title !== undefined) update.title = parseTitle(body.title);
  if (body.summary !== undefined) update.summary = text(body.summary, 'Ringkasan', SUMMARY_MAX, false);
  if (body.status !== undefined) {
    if (!(caseStatus.enumValues as readonly string[]).includes(String(body.status))) {
      throw new CaseInputError(`Status kasus harus salah satu dari: ${caseStatus.enumValues.join(', ')}.`);
    }
    update.status = body.status as CaseStatus;
  }
  if (body.tags !== undefined) update.tags = parseTags(body.tags);
  if (Object.keys(update).length === 0) throw new CaseInputError('Tidak ada yang diubah.');
  return update;
}
