import { toCheckViews } from './chains-catalog.mapper.js';

describe('toCheckViews', () => {
  it('membaca pemeriksaan tersimpan dan melewati entri yang bentuknya tidak dikenal', () => {
    expect(
      toCheckViews([
        { code: 'rpc.head', provider: 'base-rpc', level: 'rpc', ok: true, detail: 'Blok 1' },
        { code: 'indexer.holders', ok: false },
        { code: 42, ok: true },
        null,
        'teks',
      ]),
    ).toEqual([
      { code: 'rpc.head', provider: 'base-rpc', level: 'rpc', ok: true, detail: 'Blok 1' },
      { code: 'indexer.holders', provider: '', level: 'data', ok: false, detail: '' },
    ]);
    expect(toCheckViews({ code: 'rpc.head' })).toEqual([]);
  });
});
