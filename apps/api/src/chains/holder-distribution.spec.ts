import { distributeHolders, percentOf } from './holder-distribution.js';

const E18 = 10n ** 18n;
const holder = (address: string, tokens: bigint) => ({ address, isContract: false, labels: [], balance: tokens * E18 });

describe('percentOf', () => {
  it('menghitung persen dengan presisi tetap dan membulatkan ke bawah', () => {
    expect(percentOf(1n, 3n, 6)).toBe('33.333333');
    expect(percentOf(2n, 3n, 4)).toBe('66.6666');
    expect(percentOf(5n, 5n, 4)).toBe('100.0000');
    expect(percentOf(0n, 5n, 6)).toBe('0.000000');
  });

  it('tetap presisi untuk angka uint256', () => {
    const supply = 420689899645071695787564425681079n;
    expect(percentOf(25440231359335883197028959490652n, supply, 6)).toBe('6.047264');
  });
});

describe('distributeHolders', () => {
  it('mengurutkan dari saldo terbesar, membuang saldo nol, dan menghitung konsentrasi', () => {
    const result = distributeHolders(
      [holder('0xb', 300n), holder('0xa', 600n), holder('0xnol', 0n), holder('0xc', 50n)],
      1000n * E18,
    );
    expect(result).toEqual({
      ok: true,
      holders: [
        expect.objectContaining({ address: '0xa', rank: 1, balanceRaw: (600n * E18).toString(), sharePct: '60.000000' }),
        expect.objectContaining({ address: '0xb', rank: 2, sharePct: '30.000000' }),
        expect.objectContaining({ address: '0xc', rank: 3, sharePct: '5.000000' }),
      ],
      concentration: { top10Pct: '95.0000', top50Pct: '95.0000' },
    });
  });

  it('memisahkan 10 dan 50 holder teratas', () => {
    const many = Array.from({ length: 60 }, (_, index) => holder(`0x${index}`, 10n));
    const result = distributeHolders(many, 1000n * E18);
    expect(result.ok && result.concentration).toEqual({ top10Pct: '10.0000', top50Pct: '50.0000' });
    expect(result.ok && result.holders).toHaveLength(60);
  });

  it('saldo sama tetap memakai urutan dari indexer', () => {
    const result = distributeHolders([holder('0xpertama', 5n), holder('0xkedua', 5n)], 10n * E18);
    expect(result.ok && result.holders.map((entry) => entry.address)).toEqual(['0xpertama', '0xkedua']);
  });

  it('menolak data yang tidak masuk akal', () => {
    expect(distributeHolders([holder('0xa', 1n)], 0n)).toEqual({
      ok: false,
      reason: 'Total supply nol, porsi holder tidak bisa dihitung',
    });
    expect(distributeHolders([holder('0xa', 6n), holder('0xb', 6n)], 10n * E18)).toEqual({
      ok: false,
      reason: 'Jumlah saldo holder melebihi total supply',
    });
  });
});
