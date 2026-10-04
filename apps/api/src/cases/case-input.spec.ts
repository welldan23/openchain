import { CaseInputError, parseItems, parseNewCase, parseTags, parseUpdate } from './case-input.js';

const hash = `0x${'AB'.repeat(32)}`;
const finding = { id: 'cluster-1', title: 'Kelompok dompet', classification: 'heuristic', evidenceTxHashes: [hash, hash.toLowerCase()] };

describe('validasi kasus', () => {
  it('kasus baru: merapikan teks, tag kecil dan unik, temuan menerima id atau key', () => {
    expect(parseNewCase({ title: '  Kasus A ', tags: ['Rug', ' rug ', 'Bridge'], findings: [finding] })).toEqual({
      title: 'Kasus A',
      summary: '',
      tags: ['rug', 'bridge'],
      subject: null,
      findings: [{ key: 'cluster-1', title: 'Kelompok dompet', detail: '', classification: 'heuristic', chain: null, evidenceTxHashes: [hash.toLowerCase()] }],
      note: null,
      step: null,
    });
    expect(parseItems({ findings: [{ ...finding, id: undefined, key: 'k', classification: 'fact' }] }).findings[0]).toMatchObject({ key: 'k', classification: 'verified_fact' });
    expect(parseItems({ findings: [{ ...finding, classification: 'calculation' }] }).findings[0].classification).toBe('derived_metric');
  });

  it('hash base58 tidak diubah hurufnya', () => {
    const solana = '5'.repeat(30) + 'AbCdEfGhJk';
    expect(parseItems({ findings: [{ ...finding, evidenceTxHashes: [solana] }] }).findings[0].evidenceTxHashes).toEqual([solana]);
  });

  it('menolak temuan tanpa bukti, klasifikasi tak dikenal, dan hash rusak', () => {
    expect(() => parseItems({ findings: [{ ...finding, evidenceTxHashes: [] }] })).toThrow('tanpa hash bukti');
    expect(() => parseItems({ findings: [{ ...finding, evidenceTxHashes: undefined }] })).toThrow('tanpa hash bukti');
    expect(() => parseItems({ findings: [{ ...finding, classification: 'unavailable' }] })).toThrow('Klasifikasi temuan tidak dikenal');
    expect(() => parseItems({ findings: [{ ...finding, evidenceTxHashes: ['0x12'] }] })).toThrow('Hash bukti tidak valid');
    expect(() => parseItems({ findings: Array.from({ length: 51 }, () => finding) })).toThrow('maksimal 50');
  });

  it('subjek dan langkah harus menunjuk halaman yang cocok', () => {
    const subject = { kind: 'token', chain: 'base', address: '0xabc', title: 'BRETT', href: '/token/base/0xabc' };
    expect(parseItems({ subject }).subject).toEqual(subject);
    const reject = (body: unknown) => expect(() => parseItems(body)).toThrow(CaseInputError);
    reject({ subject: { ...subject, chain: null } });
    reject({ subject: { ...subject, kind: 'cluster' } });
    reject({ subject: { ...subject, href: '/admin/x' } });
    reject({ step: { kind: 'map', title: 'Peta', href: '/token/base/0xabc' } });
    reject({ step: { kind: 'login', title: 'x', href: '/login/x' } });
    reject({ note: 'x'.repeat(281) });
    reject([]);
  });

  it('ubah kasus: hanya kolom yang dikirim; kosong atau status salah ditolak', () => {
    expect(parseUpdate({ status: 'closed' })).toEqual({ status: 'closed' });
    expect(parseUpdate({ summary: '  ', tags: [] })).toEqual({ summary: '', tags: [] });
    expect(() => parseUpdate({})).toThrow('Tidak ada yang diubah');
    expect(() => parseUpdate({ status: 'archived' })).toThrow('Status kasus');
    expect(() => parseUpdate({ title: 'x'.repeat(121) })).toThrow('maksimal 120');
    expect(() => parseTags(Array.from({ length: 11 }, (_, index) => `t${index}`))).toThrow('maksimal 10');
  });
});
