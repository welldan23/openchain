import { bridgeChecks, type BridgeLeg } from './bridge-checks.js';

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const leg = (amountRaw: string, minutes: number, asset: string | null = 'native:ETH', symbol = 'ETH'): BridgeLeg => ({ asset, symbol, amountRaw, at: new Date(T0 + minutes * 60_000) });
const now = (minutes: number) => new Date(T0 + minutes * 60_000);
const summary = (checks: ReturnType<typeof bridgeChecks>) => checks.map((check) => [check.id, check.passed]);

describe('bridgeChecks', () => {
  it('semua lolos untuk aset sama, selisih kecil, dan waktu wajar', () => {
    const checks = bridgeChecks(leg('1000000', 0), leg('995000', 20), now(60));
    expect(summary(checks)).toEqual([
      ['asset', true],
      ['amount', true],
      ['timing', true],
    ]);
    expect(checks[1].detail).toBe('Selisih 0,5%, wajar untuk biaya bridge.');
    expect(checks[2].detail).toBe('Diterima 20 menit setelah dikirim.');
  });

  it('menandai aset berbeda, selisih besar, jumlah lebih besar, dan jeda terlalu lama', () => {
    expect(summary(bridgeChecks(leg('1000000', 0), leg('950000', 3000, 'native:BNB', 'BNB'), now(4000)))).toEqual([
      ['asset', false],
      ['amount', false],
      ['timing', false],
    ]);
    expect(bridgeChecks(leg('100', 0), leg('101', 5), now(10))[1]).toMatchObject({ passed: false, detail: 'Jumlah diterima lebih besar dari yang dikirim.' });
  });

  it('tanpa penerimaan: aset dan jumlah belum bisa dicek, waktu gagal hanya setelah 24 jam', () => {
    expect(summary(bridgeChecks(leg('100', 0), null, now(30)))).toEqual([
      ['asset', null],
      ['amount', null],
      ['timing', null],
    ]);
    const late = bridgeChecks(leg('100', 0), null, now(3 * 24 * 60));
    expect(late[2]).toMatchObject({ passed: false, detail: expect.stringContaining('Sudah 3 hari') });
  });
});
