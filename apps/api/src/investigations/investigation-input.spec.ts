import { InvestigationInputError, parseNewInvestigation, parseNote } from './investigation-input.js';

const valid = { kind: 'token', title: '  Nebula Finance (NBLA) ', chain: 'robinhood', href: '/token/robinhood/0xabc' };

describe('validasi riwayat investigasi', () => {
  it('menerima isian yang benar dan merapikan teks', () => {
    expect(parseNewInvestigation({ ...valid, note: '  cek lagi ', findingCount: 3 })).toEqual({
      kind: 'token',
      title: 'Nebula Finance (NBLA)',
      chain: 'robinhood',
      href: '/token/robinhood/0xabc',
      note: 'cek lagi',
      findingCount: 3,
    });
    expect(parseNewInvestigation({ kind: 'multichain', title: 'Funder', href: '/multichain/0xabc' })).toMatchObject({ chain: null, note: null, findingCount: null });
  });

  it('menolak jenis, judul, tautan, chain, dan jumlah temuan yang salah', () => {
    const reject = (body: unknown) => expect(() => parseNewInvestigation(body)).toThrow(InvestigationInputError);
    reject(null);
    reject([]);
    reject({ ...valid, kind: 'admin' });
    reject({ ...valid, title: '   ' });
    reject({ ...valid, title: 'x'.repeat(201) });
    reject({ ...valid, href: '/admin/rahasia' });
    reject({ ...valid, href: 'https://contoh.test/token/a' });
    reject({ ...valid, href: '/map/robinhood/0xabc' });
    reject({ ...valid, chain: 'Bukan Chain' });
    reject({ ...valid, findingCount: -1 });
    reject({ ...valid, findingCount: 1.5 });
  });

  it('catatan kosong berarti hapus; lebih dari 280 karakter ditolak', () => {
    expect(parseNote('   ')).toBeNull();
    expect(parseNote(undefined)).toBeNull();
    expect(parseNote('x'.repeat(280))).toHaveLength(280);
    expect(() => parseNote('x'.repeat(281))).toThrow('maksimal 280');
    expect(() => parseNote(5)).toThrow(InvestigationInputError);
  });
});
