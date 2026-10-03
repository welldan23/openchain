import { formatUnits, numericToNumber } from './units.js';

describe('formatUnits', () => {
  it('mengubah wei menjadi desimal tanpa nol berlebih', () => {
    expect(formatUnits('1500000000000000000', 18)).toBe('1.5');
    expect(formatUnits('1000000000000000000000000000', 18)).toBe('1000000000');
    expect(formatUnits('999850000000000', 6)).toBe('999850000');
    expect(formatUnits('1', 6)).toBe('0.000001');
    expect(formatUnits('0', 18)).toBe('0');
    expect(formatUnits('42', 0)).toBe('42');
  });

  it('menjaga presisi uint256', () => {
    const max = (2n ** 256n - 1n).toString();
    expect(formatUnits(max, 18)).toBe(
      '115792089237316195423570985008687907853269984665640564039457.584007913129639935',
    );
  });

  it('menolak input yang tidak valid', () => {
    expect(() => formatUnits('-1', 18)).toThrow();
    expect(() => formatUnits('1.5', 18)).toThrow();
    expect(() => formatUnits('10', -1)).toThrow();
  });
});

describe('numericToNumber', () => {
  it('mengubah string numeric dan membiarkan null', () => {
    expect(numericToNumber('612400.00')).toBe(612400);
    expect(numericToNumber('0.004213000000000000')).toBe(0.004213);
    expect(numericToNumber(null)).toBeNull();
    expect(numericToNumber('bukan-angka')).toBeNull();
  });
});
