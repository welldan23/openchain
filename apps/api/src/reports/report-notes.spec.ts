import { parseNoteCreate, parseNoteUpdate } from './report-input.js';
import { claimOptions, notesSectionAt, reportNotes } from './report-notes.js';
import type { ReportSectionView } from './reports.types.js';

const sections: ReportSectionView[] = [
  {
    id: '1',
    title: 'Temuan',
    blocks: [
      {
        kind: 'claim',
        id: '10',
        claim: { id: '10', title: 'Pendana bersama', detail: '', classification: 'heuristic', provider: null, observedAt: null, evidence: [], evidenceTxHashes: [], sourceKey: null },
      },
      { kind: 'note', id: '11', body: 'Cek label', createdAt: '2026-10-03T00:00:00.000Z', editedAt: null, claimBlockId: '10' },
    ],
  },
  { id: '2', title: 'Catatan investigasi', blocks: [{ kind: 'note', id: '20', body: 'Umum', createdAt: '2026-10-03T01:00:00.000Z', editedAt: null, claimBlockId: null }] },
];

describe('catatan laporan', () => {
  it('daftar catatan dengan bagian dan klaim yang dibahas; pilihan klaim urut laporan', () => {
    expect(reportNotes(sections)).toEqual([
      { id: '11', body: 'Cek label', createdAt: '2026-10-03T00:00:00.000Z', editedAt: null, sectionId: '1', sectionTitle: 'Temuan', claim: { blockId: '10', title: 'Pendana bersama' } },
      { id: '20', body: 'Umum', createdAt: '2026-10-03T01:00:00.000Z', editedAt: null, sectionId: '2', sectionTitle: 'Catatan investigasi', claim: null },
    ]);
    expect(claimOptions(sections)).toEqual([{ blockId: '10', title: 'Pendana bersama' }]);
  });

  it('bagian catatan sebelum Batasan, atau di akhir', () => {
    expect(notesSectionAt(['Ringkasan', 'Batasan'])).toBe(1);
    expect(notesSectionAt(['Ringkasan', 'Temuan'])).toBe(2);
  });

  it('isi catatan wajib, maksimal 280 karakter tanpa dipotong; kaitan klaim boleh dilepas', () => {
    expect(parseNoteCreate({ body: '  Cek ulang ', claimBlockId: '10' })).toEqual({ body: 'Cek ulang', claimBlockId: 10 });
    expect(() => parseNoteCreate({ body: ' ' })).toThrow('Catatan wajib diisi');
    expect(() => parseNoteCreate({ body: 'x'.repeat(281) })).toThrow('maksimal 280 karakter (sekarang 281)');
    expect(() => parseNoteCreate({ body: 'x', claimBlockId: 'klaim' })).toThrow('Id klaim');
    expect(parseNoteUpdate({ claimBlockId: null })).toEqual({ claimBlockId: null });
    expect(() => parseNoteUpdate({})).toThrow('Tidak ada yang diubah');
  });
});
