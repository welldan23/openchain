import { chainStatus, providerStatus, toProviderAvailability, type ProviderRunStats } from './chain-availability.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 4, 0, minutes));
const stats = (extra: Partial<ProviderRunStats>): ProviderRunStats => ({
  provider: 'blockscout',
  kind: 'indexed_data',
  runs: 10,
  failures: 0,
  lastStatusFailed: false,
  lastSuccessAt: at(10),
  lastFailureAt: null,
  lastFailureReason: null,
  ...extra,
});

describe('status ketersediaan', () => {
  it('membedakan tersedia, terganggu, tidak tersedia, dan belum diketahui', () => {
    expect(providerStatus(stats({}))).toBe('available');
    expect(providerStatus(stats({ failures: 2, lastFailureAt: at(5) }))).toBe('available');
    expect(providerStatus(stats({ failures: 1, lastStatusFailed: true, lastFailureAt: at(11) }))).toBe('degraded');
    expect(providerStatus(stats({ failures: 5 }))).toBe('degraded');
    expect(providerStatus(stats({ failures: 10, lastStatusFailed: true, lastSuccessAt: null, lastFailureReason: 'HTTP 403: diblokir proteksi bot (Cloudflare)' }))).toBe('unavailable');
    expect(providerStatus(stats({ runs: 0, failures: 0, lastSuccessAt: null }))).toBe('unknown');
  });

  it('menghitung persen gagal dan menggabungkan status chain', () => {
    const view = toProviderAvailability(stats({ runs: 3, failures: 1, lastFailureAt: at(1), lastFailureReason: 'HTTP 429' }));
    expect(view).toMatchObject({ status: 'available', failureRatePct: 33.33, lastFailureReason: 'HTTP 429', lastSuccessAt: at(10).toISOString() });
    const ok = toProviderAvailability(stats({}));
    const down = toProviderAvailability(stats({ failures: 10, lastSuccessAt: null, lastStatusFailed: true }));
    expect(chainStatus([ok, ok])).toBe('available');
    expect(chainStatus([ok, down])).toBe('degraded');
    expect(chainStatus([down])).toBe('unavailable');
    expect(chainStatus([])).toBe('unknown');
  });
});
