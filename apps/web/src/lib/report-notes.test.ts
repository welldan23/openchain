import { describe, expect, it } from "vitest";
import { MOCK_REPORTS } from "./mock/reports";
import { addNote, NOTES_SECTION, noteClaimOptions, removeNote, reportNotes, updateNote } from "./report-notes";

const [draft, final] = MOCK_REPORTS;
const T1 = "2026-10-04T08:00:00.000Z";
const T2 = "2026-10-04T09:00:00.000Z";

describe("catatan investigasi laporan", () => {
  it("menambah catatan yang dirapikan di akhir bagian catatan, dengan kaitan klaim yang valid", () => {
    const [claim] = noteClaimOptions(draft);
    const result = addNote(draft, "  Cek ulang pendana minggu depan.  ", T1, claim.blockId);
    if (!result.ok) throw new Error(result.error);
    const notes = reportNotes(result.report);
    expect(notes).toHaveLength(reportNotes(draft).length + 1);
    expect(notes.at(-1)).toMatchObject({ id: result.blockId, body: "Cek ulang pendana minggu depan.", createdAt: T1, claimBlockId: claim.blockId });
    expect(result.report.updatedAt).toBe(T1);
    // Kaitan ke klaim yang tidak ada diabaikan, bukan disimpan.
    const loose = addNote(draft, "x", T1, "klaim-tidak-ada");
    expect(loose.ok && reportNotes(loose.report).at(-1)?.claimBlockId).toBeUndefined();
  });

  it("menolak catatan kosong atau lebih dari 280 karakter", () => {
    expect(addNote(draft, "   ", T1)).toEqual({ ok: false, error: "Catatan masih kosong." });
    const long = addNote(draft, "x".repeat(281), T1);
    expect(long.ok).toBe(false);
    expect(!long.ok && long.error).toContain("maksimal 280");
  });

  it("laporan tanpa bagian catatan: bagian dibuat sebelum Batasan; id catatan tidak bentrok", () => {
    const first = addNote(final, "Catatan pertama", T1);
    if (!first.ok) throw new Error(first.error);
    const ids = first.report.sections.map((section) => section.id);
    expect(ids.indexOf(NOTES_SECTION.id)).toBe(ids.indexOf("batasan") - 1);
    const second = addNote(first.report, "Catatan kedua", T1);
    if (!second.ok) throw new Error(second.error);
    expect(second.blockId).not.toBe(first.blockId);
  });

  it("mengubah isi dan kaitan, waktu dibuat tetap; isi kosong ditolak dengan arahan hapus", () => {
    const [note] = reportNotes(draft);
    const [, claim] = noteClaimOptions(draft);
    const result = updateNote(draft, note.id, "Isi baru", T2, claim.blockId);
    if (!result.ok) throw new Error(result.error);
    expect(reportNotes(result.report)[0]).toEqual({ kind: "note", id: note.id, body: "Isi baru", createdAt: note.createdAt, editedAt: T2, claimBlockId: claim.blockId });
    const cleared = updateNote(result.report, note.id, "Isi baru", T2, null);
    expect(cleared.ok && reportNotes(cleared.report)[0].claimBlockId).toBeUndefined();
    expect(updateNote(draft, note.id, " ", T2)).toEqual({ ok: false, error: "Catatan tidak boleh kosong. Pakai Hapus untuk membuangnya." });
    expect(updateNote(draft, "tidak-ada", "x", T2)).toEqual({ ok: false, error: "Catatan ini sudah tidak ada." });
  });

  it("menghapus catatan; menghapus yang sudah tidak ada memberi galat", () => {
    const [note] = reportNotes(draft);
    const result = removeNote(draft, note.id, T2);
    if (!result.ok) throw new Error(result.error);
    expect(reportNotes(result.report).map((item) => item.id)).not.toContain(note.id);
    expect(removeNote(result.report, note.id, T2).ok).toBe(false);
  });
});
