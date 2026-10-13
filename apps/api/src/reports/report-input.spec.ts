import { parseNewReport, parseReportUpdate, parseSections, ReportInputError } from './report-input.js';

const HASH = '0x' + 'AB'.repeat(32);

describe('validasi laporan', () => {
  it('laporan baru: judul wajib, kasus opsional, isi bagian dan blok semua jenis', () => {
    const input = parseNewReport({
      title: '  Laporan NBLA ',
      caseId: '7',
      sections: [
        {
          id: 'temuan',
          title: 'Temuan',
          blocks: [
            { kind: 'paragraph', id: 'p1', text: 'Ringkasan.' },
            { kind: 'claim', id: 'c1', claim: { title: 'Pendana bersama', detail: '5 wallet', classification: 'fact', provider: 'Blockscout', observedAt: '2026-10-03T04:30:00Z', evidenceTxHashes: [HASH, HASH] } },
            { kind: 'evidence', id: 'e1', chain: 'robinhood', txHash: HASH, caption: 'Kiriman dana' },
            { kind: 'note', id: 'n1', body: 'Cek ulang', claimBlockId: 'c1' },
            { kind: 'entity', id: 'x1', subject: { kind: 'address', chain: 'base', address: '0xabc', title: 'Pendana', href: '/flow/base/0xabc' } },
          ],
        },
      ],
    });
    expect(input).toMatchObject({ title: 'Laporan NBLA', summary: '', caseId: 7 });
    const [paragraph, claim, evidence, note] = input.sections[0].blocks;
    expect(paragraph).toEqual({ kind: 'paragraph', id: 'p1', text: 'Ringkasan.' });
    // Istilah frontend diterima, hash dinormalkan dan tidak kembar; chain dipastikan belakangan.
    expect(claim).toMatchObject({ claim: { classification: 'verified_fact', provider: 'Blockscout', evidence: [{ chain: null, txHash: HASH.toLowerCase() }] } });
    expect(claim.kind === 'claim' && claim.claim.observedAt?.toISOString()).toBe('2026-10-03T04:30:00.000Z');
    expect(evidence).toMatchObject({ chain: 'robinhood', txHash: HASH.toLowerCase() });
    expect(note).toMatchObject({ claimBlockId: 'c1' });
  });

  it('klaim boleh belum lengkap: provider, waktu, dan bukti kosong ditandai kesiapan, bukan ditolak', () => {
    const [section] = parseSections([{ title: 'A', blocks: [{ kind: 'claim', claim: { title: 'Dugaan', classification: 'heuristic', provider: '  ' } }] }]);
    expect(section.blocks[0]).toMatchObject({ id: null, claim: { provider: null, observedAt: null, evidence: [], detail: '' } });
  });

  it('klaim yang dikirim balik dari GET memakai evidence ber-chain, bukan evidenceTxHashes', () => {
    const [section] = parseSections([
      { title: 'A', blocks: [{ kind: 'claim', claim: { title: 'x', classification: 'heuristic', evidence: [{ chain: 'base', txHash: HASH }], evidenceTxHashes: [HASH] } }] },
    ]);
    expect(section.blocks[0]).toMatchObject({ claim: { evidence: [{ chain: 'base', txHash: HASH.toLowerCase() }] } });
  });

  it('catatan yang klaimnya tidak dikirim lagi dilepas kaitannya (klaim dihapus)', () => {
    const [section] = parseSections([{ title: 'A', blocks: [{ kind: 'note', id: '5', body: 'Cek', claimBlockId: '4' }] }]);
    expect(section.blocks[0]).toMatchObject({ kind: 'note', claimBlockId: null });
  });

  it('menolak isi yang salah dengan pesan yang jelas', () => {
    const bad: Array<[unknown, string]> = [
      [{ title: '' }, 'Judul laporan wajib diisi'],
      [{ title: 'x'.repeat(161) }, 'maksimal 160'],
      [{ title: 'A', caseId: -1 }, 'Id kasus tidak valid'],
      [{ title: 'A', sections: [{ title: 'B', blocks: [{ kind: 'gambar' }] }] }, 'Jenis blok tidak dikenal'],
      [{ title: 'A', sections: [{ title: 'B', blocks: [{ kind: 'claim', claim: { title: 'x', classification: 'unavailable' } }] }] }, 'Klasifikasi klaim tidak dikenal'],
      [{ title: 'A', sections: [{ title: 'B', blocks: [{ kind: 'claim', claim: { title: 'x', classification: 'fact', observedAt: 'kemarin' } }] }] }, 'tanggal ISO'],
      [{ title: 'A', sections: [{ title: 'B', blocks: [{ kind: 'evidence', txHash: HASH }] }] }, 'wajib menyebut chain'],
      [{ title: 'A', sections: [{ title: 'B', blocks: [{ kind: 'note', body: 'x'.repeat(281) }] }] }, 'maksimal 280'],
      [{ title: 'A', sections: [{ title: 'B', blocks: [{ kind: 'note', body: 'x', claimBlockId: 'hilang' }] }] }, 'klaim yang tidak ada'],
      [{ title: 'A', sections: [{ title: 'B', blocks: [{ kind: 'entity', subject: { kind: 'token', address: '0x1', title: 'T', href: '/token/base/0x1' } }] }] }, 'wajib menyebut chain'],
      [{ title: 'A', sections: [{ id: 's', title: 'B' }, { id: 's', title: 'C' }] }, 'tidak boleh kembar'],
    ];
    for (const [body, message] of bad) expect(() => parseNewReport(body), message).toThrow(message);
    expect(() => parseNewReport({ title: 'A', sections: [{ title: 'B', blocks: [{ kind: 'paragraph', id: 'a b' }] }] })).toThrow(ReportInputError);
  });

  it('ubah: hanya yang dikirim, status dikenal, dan tidak boleh kosong', () => {
    expect(parseReportUpdate({ status: 'final' })).toEqual({ status: 'final' });
    expect(parseReportUpdate({ summary: null, sections: [] })).toEqual({ summary: '', sections: [] });
    expect(() => parseReportUpdate({ status: 'terbit' })).toThrow('Status laporan');
    expect(() => parseReportUpdate({})).toThrow('Tidak ada yang diubah');
  });
});
