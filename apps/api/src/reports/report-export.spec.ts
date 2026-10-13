import { PdfDocument, textWidth, toWinAnsi, wrapText } from './pdf-writer.js';
import { csvCell, exportFileName, formatUtc, reportToCsv, reportToPdf, type ExportContext } from './report-export.js';
import type { ReportView } from './reports.types.js';

const HASH = '0x' + 'ab'.repeat(32);
const report: ReportView = {
  id: '1',
  title: 'Dugaan bundler NBLA',
  summary: 'Ringkasan (uji) dengan karakter khusus: → … – "kutip"',
  status: 'draft',
  createdAt: '2026-10-03T04:00:00.000Z',
  updatedAt: '2026-10-03T05:00:00.000Z',
  finalizedAt: null,
  source: { caseId: '7', title: 'Kasus NBLA', href: '/kasus/7' },
  sections: [
    {
      id: '1',
      title: 'Temuan',
      blocks: [
        {
          kind: 'claim',
          id: '10',
          claim: { id: '10', title: '=Pendana bersama', detail: 'Lima wallet, satu pendana', classification: 'heuristic', provider: null, observedAt: null, evidence: [{ chain: 'base', txHash: HASH }], evidenceTxHashes: [HASH], sourceKey: null },
        },
        { kind: 'evidence', id: '11', chain: 'base', txHash: HASH, caption: 'Kiriman dana' },
        { kind: 'note', id: '12', body: 'Cek, ulang', createdAt: '2026-10-03T04:30:00.000Z', editedAt: null, claimBlockId: '10' },
        { kind: 'entity', id: '13', subject: { kind: 'address', chain: null, address: '0xabc', title: 'Pendana', href: '/multichain/0xabc' }, sourceKey: null },
      ],
    },
    { id: '2', title: 'Kesimpulan', blocks: [] },
  ],
  evidence: [{ chain: 'base', txHash: HASH, stored: false, timestamp: null, blockNumber: null, movements: [], explorerUrl: `https://basescan.org/tx/${HASH}` }],
  snapshot: { fetchedAt: '2026-10-03T04:00:00.000Z', blocks: [{ chain: 'base', blockNumber: 52_145_528 }], sources: ['blockscout'], dataStatus: 'partial', statusReason: 'Label holder belum lengkap.' },
  readiness: {
    ready: false,
    issues: [
      { kind: 'claim_without_provider', level: 'blocker', sectionId: '1', blockId: '10', message: 'Klaim "=Pendana bersama" belum menyebut provider datanya.' },
      { kind: 'empty_section', level: 'warning', sectionId: '2', blockId: null, message: 'Bagian "Kesimpulan" masih kosong.' },
    ],
  },
};
const context: ExportContext = {
  classificationLabels: new Map([
    ['heuristic', 'Dugaan (heuristic)'],
    ['verified_fact', 'Fakta on-chain'],
  ]),
  evidence: [
    {
      chain: 'base',
      txHash: HASH,
      stored: false,
      explorerUrl: `https://basescan.org/tx/${HASH}`,
      detail: null,
      citedBy: [{ blockId: '10', title: '=Pendana bersama' }],
      embeddedBlockId: '11',
      capture: { fetchedAt: '2026-10-03T04:00:00.000Z', blockNumber: 52_145_528, sources: ['blockscout'] },
    },
  ],
  generatedAt: new Date('2026-10-04T08:00:00Z'),
};

/** Periksa tabel xref: setiap offset harus menunjuk ke awal objek bernomor sama. */
function expectValidXref(pdf: Buffer) {
  const text = pdf.toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
  expect(text.slice(start, start + 4)).toBe('xref');
  const [, count] = /^xref\n0 (\d+)\n/.exec(text.slice(start))!;
  const offsets = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  expect(offsets).toHaveLength(Number(count) - 1);
  offsets.forEach((offset, index) => expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`));
}

describe('ekspor laporan', () => {
  it('nama file dan waktu UTC', () => {
    expect(exportFileName('Dugaan bundler NBLA!', 'pdf', context.generatedAt)).toBe('laporan-dugaan-bundler-nbla-20261004.pdf');
    expect(exportFileName('Laporan akhir', 'csv', context.generatedAt)).toBe('laporan-akhir-20261004.csv');
    expect(formatUtc('2026-10-03T04:30:59.000Z')).toBe('2026-10-03 04:30 UTC');
  });

  it('CSV: status draf di baris pertama, klaim per hash dengan explorer, sel aman dari rumus, masalah kesiapan di akhir', () => {
    const csv = reportToCsv(report, context);
    expect(csv.startsWith('﻿jenis_baris,bagian,judul')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[1]).toBe('status_laporan,,Dugaan bundler NBLA,,,2026-10-03T05:00:00.000Z,,,,DRAF — belum lengkap: 1 hal perlu dilengkapi');
    expect(lines[2]).toContain('snapshot,,,,blockscout,');
    expect(lines[3]).toBe(`klaim,Temuan,'=Pendana bersama,Dugaan (heuristic),,,base,${HASH},https://basescan.org/tx/${HASH},"Lima wallet, satu pendana"`);
    expect(lines[4]).toBe(`bukti,Temuan,Kiriman dana,Fakta on-chain,,,base,${HASH},https://basescan.org/tx/${HASH},`);
    expect(lines[5]).toBe('catatan,Temuan,,,,2026-10-03T04:30:00.000Z,,,,"Cek, ulang"');
    expect(lines[6]).toBe('entitas,Temuan,Pendana,,,,,,,0xabc');
    expect(lines.slice(-2)).toEqual([
      `masalah_kesiapan,,,,,,,,,"Perlu dilengkapi: Klaim ""=Pendana bersama"" belum menyebut provider datanya."`,
      'masalah_kesiapan,,,,,,,,,"Peringatan: Bagian ""Kesimpulan"" masih kosong."',
    ]);
    expect(csvCell(null)).toBe('');
    expect(csvCell('-5')).toBe("'-5");
  });

  it('PDF: berkas valid, teks klaim dan nilai kosong tertulis, hash menjadi tautan explorer', () => {
    const pdf = reportToPdf(report, context);
    expectValidXref(pdf);
    const text = pdf.toString('latin1');
    expect(text).toContain('(DRAF \\227 belum lengkap: 1 hal perlu dilengkapi)');
    expect(text).toContain('(Provider: belum ada)');
    expect(text).toContain(`/URI (https://basescan.org/tx/${HASH})`);
    expect(text).toContain('(Rincian transaksi tidak ikut tersimpan; buka di explorer.)');
    // Karakter di luar WinAnsi diganti padanannya, kurung di-escape.
    expect(text).toContain('Ringkasan \\(uji\\) dengan karakter khusus: -> \\205 \\226 "kutip"');
    expect(text).toContain('/Title (Dugaan bundler NBLA)');
  });

  it('penulis PDF: bungkus teks sesuai lebar, potong kata panjang, pindah halaman', () => {
    expect(toWinAnsi('a→b…ü€😀')).toEqual([0x61, 0x2d, 0x3e, 0x62, 0x85, 0xfc, 0x80, 0x3f]);
    expect(textWidth('W', 10)).toBeCloseTo(9.44);
    const lines = wrapText(`kata ${'x'.repeat(200)} akhir`, 100, 10);
    expect(lines.every((line) => textWidth(line, 10) <= 100)).toBe(true);
    expect(lines.join('')).toBe(`kata${'x'.repeat(200)}akhir`);
    const doc = new PdfDocument('Kaki.');
    for (let index = 0; index < 120; index += 1) doc.text(`Baris ${index}`);
    const pdf = doc.toBuffer({ title: 'Uji', createdAt: new Date('2026-10-04T00:00:00Z') });
    expectValidXref(pdf);
    expect(pdf.toString('latin1')).toMatch(/\/Count 3 >>/);
    expect(pdf.toString('latin1')).toContain('(Kaki. Halaman 3/3.)');
  });
});
