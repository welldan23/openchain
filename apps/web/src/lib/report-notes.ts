/**
 * Catatan investigasi di laporan: tambah, ubah, hapus. Aturannya sama dengan
 * catatan riwayat (maksimal 280 karakter, tidak dipotong diam-diam). Catatan
 * boleh dikaitkan ke satu klaim supaya pembaca tahu yang dibahas.
 */
import { validateNote } from "./history";
import type { InvestigationReport, ReportBlock, ReportSection } from "./types";

export const NOTES_SECTION = { id: "catatan", title: "Catatan investigasi" } as const;

type NoteBlock = Extract<ReportBlock, { kind: "note" }>;
export type NoteResult = { ok: true; report: InvestigationReport; blockId: string } | { ok: false; error: string };

export function reportNotes(report: Pick<InvestigationReport, "sections">): NoteBlock[] {
  return report.sections.flatMap((section) => section.blocks.filter((block): block is NoteBlock => block.kind === "note"));
}

/** Klaim yang bisa dipilih sebagai kaitan catatan, urut sesuai laporan. */
export function noteClaimOptions(report: Pick<InvestigationReport, "sections">): Array<{ blockId: string; title: string }> {
  return report.sections.flatMap((section) => section.blocks.flatMap((block) => (block.kind === "claim" ? [{ blockId: block.id, title: block.claim.title }] : [])));
}

function cleanBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const validation = validateNote(raw);
  if (!validation.ok) return validation;
  if (!validation.note) return { ok: false, error: "Catatan masih kosong." };
  return { ok: true, body: validation.note };
}

function validClaim(report: InvestigationReport, claimBlockId: string | null): string | undefined {
  if (!claimBlockId) return undefined;
  return noteClaimOptions(report).some((option) => option.blockId === claimBlockId) ? claimBlockId : undefined;
}

function uniqueId(report: InvestigationReport, createdAt: string): string {
  const used = new Set(report.sections.flatMap((section) => section.blocks.map((block) => block.id)));
  const base = `catatan-${Date.parse(createdAt).toString(36)}`;
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Tambah catatan di akhir bagian catatan; bagian dibuat sebelum "Batasan" (atau di akhir) bila belum ada. */
export function addNote(report: InvestigationReport, raw: string, createdAt: string, claimBlockId: string | null = null): NoteResult {
  const body = cleanBody(raw);
  if (!body.ok) return body;
  const block: NoteBlock = { kind: "note", id: uniqueId(report, createdAt), body: body.body, createdAt };
  const claim = validClaim(report, claimBlockId);
  if (claim) block.claimBlockId = claim;
  let sections: ReportSection[];
  if (report.sections.some((section) => section.id === NOTES_SECTION.id)) {
    sections = report.sections.map((section) => (section.id === NOTES_SECTION.id ? { ...section, blocks: [...section.blocks, block] } : section));
  } else {
    const created: ReportSection = { id: NOTES_SECTION.id, title: NOTES_SECTION.title, blocks: [block] };
    const limits = report.sections.findIndex((section) => section.id === "batasan");
    sections = limits === -1 ? [...report.sections, created] : [...report.sections.slice(0, limits), created, ...report.sections.slice(limits)];
  }
  return { ok: true, report: { ...report, sections, updatedAt: createdAt }, blockId: block.id };
}

function mapNote(report: InvestigationReport, blockId: string, change: (block: NoteBlock) => NoteBlock | null, updatedAt: string): NoteResult {
  let found = false;
  const sections = report.sections.map((section) => ({
    ...section,
    blocks: section.blocks.flatMap((block) => {
      if (block.kind !== "note" || block.id !== blockId) return [block];
      found = true;
      const next = change(block);
      return next ? [next] : [];
    }),
  }));
  if (!found) return { ok: false, error: "Catatan ini sudah tidak ada." };
  return { ok: true, report: { ...report, sections, updatedAt }, blockId };
}

/** Ubah isi dan kaitan klaim; waktu dibuat tetap, waktu ubah dicatat. */
export function updateNote(report: InvestigationReport, blockId: string, raw: string, editedAt: string, claimBlockId: string | null = null): NoteResult {
  const body = cleanBody(raw);
  if (!body.ok) return body.error === "Catatan masih kosong." ? { ok: false, error: "Catatan tidak boleh kosong. Pakai Hapus untuk membuangnya." } : body;
  const claim = validClaim(report, claimBlockId);
  return mapNote(
    report,
    blockId,
    (block) => {
      const next: NoteBlock = { kind: "note", id: block.id, body: body.body, createdAt: block.createdAt, editedAt };
      if (claim) next.claimBlockId = claim;
      return next;
    },
    editedAt,
  );
}

export function removeNote(report: InvestigationReport, blockId: string, updatedAt: string): NoteResult {
  return mapNote(report, blockId, () => null, updatedAt);
}
