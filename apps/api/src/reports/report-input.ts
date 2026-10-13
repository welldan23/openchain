/**
 * Validasi isi permintaan laporan. Batasnya sama dengan constraint database
 * dan frontend. Isi laporan dikirim utuh (bagian berisi blok); blok dengan id
 * yang sudah ada diperbarui, sisanya ditambahkan. Klaim boleh belum punya
 * provider, waktu data, atau hash bukti: kekurangannya ditandai di kesiapan,
 * tidak ditolak dan tidak ditebak.
 */
import { CLASSIFICATIONS, parseSubject, type SubjectInput } from '../cases/case-input.js';
import { reportStatus, type InfoClassification, type ReportStatus } from '../database/schema/enums.js';

export const REPORT_TITLE_MAX = 160;
export const SUMMARY_MAX = 2_000;
export const SECTION_TITLE_MAX = 160;
export const PARAGRAPH_MAX = 5_000;
export const CLAIM_TITLE_MAX = 200;
export const CLAIM_DETAIL_MAX = 2_000;
export const PROVIDER_MAX = 120;
export const CAPTION_MAX = 500;
export const NOTE_MAX = 280;
export const MAX_SECTIONS = 30;
export const MAX_BLOCKS = 500;
export const MAX_EVIDENCE_PER_CLAIM = 50;

export class ReportInputError extends Error {}

export interface EvidenceRefInput {
  /** Kosong: dipakai chain klaim, atau satu-satunya chain di snapshot laporan. */
  chain: string | null;
  txHash: string;
}

export interface ClaimInput {
  title: string;
  detail: string;
  classification: InfoClassification;
  provider: string | null;
  observedAt: Date | null;
  chain: string | null;
  evidence: EvidenceRefInput[];
}

/** `id` blok/bagian dari klien: id tersimpan untuk memperbarui, atau id sementara untuk blok baru. */
export type BlockInput =
  | { kind: 'paragraph'; id: string | null; text: string }
  | { kind: 'claim'; id: string | null; claim: ClaimInput }
  | { kind: 'evidence'; id: string | null; chain: string; txHash: string; caption: string }
  | { kind: 'note'; id: string | null; body: string; claimBlockId: string | null }
  | { kind: 'entity'; id: string | null; subject: SubjectInput };

export interface SectionInput {
  id: string | null;
  title: string;
  blocks: BlockInput[];
}

export interface NewReportInput {
  title: string;
  summary: string;
  caseId: number | null;
  sections: SectionInput[];
}

export interface ReportUpdateInput {
  title?: string;
  summary?: string;
  status?: ReportStatus;
  sections?: SectionInput[];
}

const CHAIN = /^[a-z0-9-]+$/;
const HASH = /^[0-9A-Za-z]{32,128}$|^0x[0-9a-fA-F]{64}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

function record(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ReportInputError(`${what} harus objek JSON.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, what: string, max: number, required = true): string {
  if (value === undefined || value === null) {
    if (required) throw new ReportInputError(`${what} wajib diisi.`);
    return '';
  }
  if (typeof value !== 'string') throw new ReportInputError(`${what} harus berupa teks.`);
  const trimmed = value.trim();
  if (required && trimmed === '') throw new ReportInputError(`${what} wajib diisi.`);
  if (trimmed.length > max) throw new ReportInputError(`${what} maksimal ${max} karakter (sekarang ${trimmed.length}).`);
  return trimmed;
}

function optionalText(value: unknown, what: string, max: number): string | null {
  const parsed = text(value, what, max, false);
  return parsed === '' ? null : parsed;
}

function chain(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !CHAIN.test(value)) throw new ReportInputError('Chain tidak valid.');
  return value;
}

function hash(value: unknown): string {
  if (typeof value !== 'string' || !HASH.test(value.trim())) throw new ReportInputError('Hash bukti tidak valid.');
  const trimmed = value.trim();
  return trimmed.startsWith('0x') ? trimmed.toLowerCase() : trimmed;
}

function clientId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const id = typeof value === 'number' ? String(value) : value;
  if (typeof id !== 'string' || !CLIENT_ID.test(id)) throw new ReportInputError('Id bagian atau blok tidak valid.');
  return id;
}

function list(value: unknown, what: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ReportInputError(`${what} harus berupa daftar.`);
  return value;
}

function observedAt(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const at = typeof value === 'string' ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) throw new ReportInputError('Waktu data klaim harus tanggal ISO.');
  return at;
}

function parseClaim(value: unknown): ClaimInput {
  const body = record(value, 'Klaim');
  const classification = CLASSIFICATIONS[String(body.classification)];
  if (!classification) throw new ReportInputError(`Klasifikasi klaim tidak dikenal: ${String(body.classification)}.`);
  const claimChain = chain(body.chain);
  // Hash boleh dikirim sebagai teks (bentuk frontend) atau { chain, txHash }.
  const raw = [...list(body.evidence, 'Bukti klaim'), ...list(body.evidenceTxHashes, 'Bukti klaim')];
  if (raw.length > MAX_EVIDENCE_PER_CLAIM) throw new ReportInputError(`Bukti per klaim maksimal ${MAX_EVIDENCE_PER_CLAIM} hash.`);
  const seen = new Set<string>();
  const evidence: EvidenceRefInput[] = [];
  for (const item of raw) {
    const ref =
      typeof item === 'string' ? { chain: claimChain, txHash: hash(item) } : (() => {
        const entry = record(item, 'Bukti klaim');
        return { chain: chain(entry.chain) ?? claimChain, txHash: hash(entry.txHash) };
      })();
    const key = `${ref.chain ?? ''}:${ref.txHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(ref);
  }
  return {
    title: text(body.title, 'Judul klaim', CLAIM_TITLE_MAX),
    detail: text(body.detail, 'Rincian klaim', CLAIM_DETAIL_MAX, false),
    classification,
    provider: optionalText(body.provider, 'Provider klaim', PROVIDER_MAX),
    observedAt: observedAt(body.observedAt),
    chain: claimChain,
    evidence,
  };
}

function parseBlock(value: unknown): BlockInput {
  const body = record(value, 'Blok');
  const id = clientId(body.id);
  switch (body.kind) {
    case 'paragraph':
      return { kind: 'paragraph', id, text: text(body.text, 'Paragraf', PARAGRAPH_MAX, false) };
    case 'claim':
      return { kind: 'claim', id, claim: parseClaim(body.claim) };
    case 'evidence': {
      const evidenceChain = chain(body.chain);
      if (!evidenceChain) throw new ReportInputError('Bukti tersemat wajib menyebut chain.');
      return { kind: 'evidence', id, chain: evidenceChain, txHash: hash(body.txHash), caption: text(body.caption, 'Keterangan bukti', CAPTION_MAX, false) };
    }
    case 'note':
      return { kind: 'note', id, body: text(body.body, 'Catatan', NOTE_MAX), claimBlockId: clientId(body.claimBlockId) };
    case 'entity': {
      try {
        const subject = parseSubject(body.subject);
        if (!subject) throw new ReportInputError('Blok entitas wajib berisi subjek.');
        return { kind: 'entity', id, subject };
      } catch (error) {
        if (error instanceof ReportInputError) throw error;
        throw new ReportInputError(error instanceof Error ? error.message : 'Subjek tidak valid.');
      }
    }
    default:
      throw new ReportInputError(`Jenis blok tidak dikenal: ${String(body.kind)}.`);
  }
}

/** Bagian beserta bloknya; id unik dalam satu laporan dan catatan hanya merujuk klaim di laporan yang sama. */
export function parseSections(value: unknown): SectionInput[] {
  const raw = list(value, 'Bagian');
  if (raw.length > MAX_SECTIONS) throw new ReportInputError(`Bagian maksimal ${MAX_SECTIONS}.`);
  const sections = raw.map((item) => {
    const body = record(item, 'Bagian');
    return { id: clientId(body.id), title: text(body.title, 'Judul bagian', SECTION_TITLE_MAX), blocks: list(body.blocks, 'Blok').map(parseBlock) };
  });
  const blocks = sections.flatMap((section) => section.blocks);
  if (blocks.length > MAX_BLOCKS) throw new ReportInputError(`Blok per laporan maksimal ${MAX_BLOCKS}.`);
  const unique = (ids: Array<string | null>, what: string) => {
    const present = ids.filter((id): id is string => id !== null);
    if (new Set(present).size !== present.length) throw new ReportInputError(`Id ${what} tidak boleh kembar.`);
  };
  unique(sections.map((section) => section.id), 'bagian');
  unique(blocks.map((block) => block.id), 'blok');
  const claims = new Set(blocks.flatMap((block) => (block.kind === 'claim' && block.id !== null ? [block.id] : [])));
  for (const block of blocks) {
    if (block.kind === 'note' && block.claimBlockId !== null && !claims.has(block.claimBlockId)) {
      throw new ReportInputError('Catatan merujuk klaim yang tidak ada di laporan ini.');
    }
  }
  return sections;
}

function caseId(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) throw new ReportInputError('Id kasus tidak valid.');
  return id;
}

export function parseNewReport(value: unknown): NewReportInput {
  const body = record(value, 'Isi permintaan');
  return {
    title: text(body.title, 'Judul laporan', REPORT_TITLE_MAX),
    summary: text(body.summary, 'Ringkasan', SUMMARY_MAX, false),
    caseId: caseId(body.caseId),
    sections: parseSections(body.sections),
  };
}

export function parseReportUpdate(value: unknown): ReportUpdateInput {
  const body = record(value, 'Isi permintaan');
  const update: ReportUpdateInput = {};
  if (body.title !== undefined) update.title = text(body.title, 'Judul laporan', REPORT_TITLE_MAX);
  if (body.summary !== undefined) update.summary = text(body.summary, 'Ringkasan', SUMMARY_MAX, false);
  if (body.status !== undefined) {
    if (!(reportStatus.enumValues as readonly string[]).includes(String(body.status))) {
      throw new ReportInputError(`Status laporan harus salah satu dari: ${reportStatus.enumValues.join(', ')}.`);
    }
    update.status = body.status as ReportStatus;
  }
  if (body.sections !== undefined) update.sections = parseSections(body.sections);
  if (Object.keys(update).length === 0) throw new ReportInputError('Tidak ada yang diubah.');
  return update;
}

export interface ComposeInput {
  /** Kunci subjek kasus (`kind:chain:address`). */
  subjects: string[];
  /** Kunci temuan: `case:<id>` atau `risk:<chain>:<address>:<reason|warning>:<kode>`. */
  findings: string[];
}

export const MAX_COMPOSE_ITEMS = 200;

export function parseCompose(value: unknown): ComposeInput {
  const body = record(value, 'Isi permintaan');
  const keys = (raw: unknown, what: string) => {
    const items = list(raw, what);
    if (items.length > MAX_COMPOSE_ITEMS) throw new ReportInputError(`${what} maksimal ${MAX_COMPOSE_ITEMS}.`);
    return [...new Set(items.map((item) => text(item, `Kunci ${what.toLowerCase()}`, 300)))];
  };
  const input = { subjects: keys(body.subjects, 'Entitas'), findings: keys(body.findings, 'Temuan') };
  if (input.subjects.length + input.findings.length === 0) throw new ReportInputError('Pilih minimal satu entitas atau temuan.');
  return input;
}
