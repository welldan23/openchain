import { defaultChainError, parsePreferencesUpdate, resolveDefaultChain, type ChainChoice } from './preferences-input.js';

const CHAINS: ChainChoice[] = [
  { id: 'robinhood', name: 'Robinhood Chain', supportStatus: 'experimental' },
  { id: 'ethereum', name: 'Ethereum', supportStatus: 'validated' },
  { id: 'base', name: 'Base', supportStatus: 'validated' },
  { id: 'solana', name: 'Solana', supportStatus: 'planned' },
];

describe('ubah preferensi tampilan', () => {
  it('menerima pilihan yang dikenal, sebagian saja', () => {
    expect(parsePreferencesUpdate({ theme: 'light', compactNumbers: false, defaultChain: 'base', email: 'x' })).toEqual({ theme: 'light', compactNumbers: false, defaultChain: 'base' });
    expect(parsePreferencesUpdate({ defaultChain: null })).toEqual({ defaultChain: null });
    expect(parsePreferencesUpdate({ language: 'id', timeDisplay: 'utc', numberLocale: 'en', valueUnit: 'native', density: 'compact' })).toEqual({
      language: 'id',
      timeDisplay: 'utc',
      numberLocale: 'en',
      valueUnit: 'native',
      density: 'compact',
    });
  });

  it('menolak nilai di luar pilihan, bahasa yang belum tersedia, dan isi kosong', () => {
    expect(() => parsePreferencesUpdate({ theme: 'sepia' })).toThrow('theme harus salah satu dari: system, dark, light.');
    expect(() => parsePreferencesUpdate({ language: 'en' })).toThrow('Bahasa Inggris belum tersedia');
    expect(() => parsePreferencesUpdate({ compactNumbers: 'ya' })).toThrow('true atau false');
    expect(() => parsePreferencesUpdate({ defaultChain: 'Base Mainnet' })).toThrow('id chain');
    expect(() => parsePreferencesUpdate({ defaultChain: 8453 })).toThrow('id chain');
    expect(() => parsePreferencesUpdate({})).toThrow('Tidak ada yang diubah');
    expect(() => parsePreferencesUpdate([])).toThrow('objek JSON');
  });
});

describe('chain bawaan', () => {
  it('hanya chain tervalidasi yang boleh dipilih', () => {
    expect(defaultChainError('base', CHAINS)).toBeNull();
    expect(defaultChainError('robinhood', CHAINS)).toBe('Robinhood Chain belum didukung penuh (status experimental); pilih chain yang sudah lolos smoke test.');
    expect(defaultChainError('cardano', CHAINS)).toBe('Chain cardano tidak dikenal.');
  });

  it('pilihan dipakai selama masih tervalidasi; selain itu chain tervalidasi pertama, dengan penjelasan', () => {
    expect(resolveDefaultChain('base', CHAINS)).toEqual({ defaultChain: 'base', source: 'chosen', note: null });
    expect(resolveDefaultChain(null, CHAINS)).toEqual({ defaultChain: 'ethereum', source: 'fallback', note: 'Belum memilih chain bawaan; memakai Ethereum.' });
    expect(resolveDefaultChain('robinhood', CHAINS)).toEqual({
      defaultChain: 'ethereum',
      source: 'fallback',
      note: 'Robinhood Chain sedang tidak tervalidasi (status experimental); sementara memakai Ethereum.',
    });
    const none = CHAINS.map((chain) => ({ ...chain, supportStatus: 'planned' as const }));
    expect(resolveDefaultChain('base', none)).toEqual({ defaultChain: null, source: 'none', note: 'Belum ada chain yang lolos smoke test.' });
  });
});
