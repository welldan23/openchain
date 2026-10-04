import { resolveFlowWindow } from './flow-range.js';

const d = (iso: string) => new Date(iso);
const coverage = { windowFrom: d('2026-09-01T00:00:00Z'), windowTo: d('2026-10-03T04:30:00Z') };

describe('rentang waktu aliran dana', () => {
  it('tanpa permintaan: seluruh cakupan', () => {
    expect(resolveFlowWindow(coverage, {})).toEqual({ from: coverage.windowFrom, to: coverage.windowTo, clipped: false, preset: 'all' });
  });

  it('preset dihitung mundur dari akhir cakupan, bukan dari sekarang', () => {
    expect(resolveFlowWindow(coverage, { preset: '24h' })).toEqual({
      from: d('2026-10-02T04:30:00Z'),
      to: coverage.windowTo,
      clipped: false,
      preset: '24h',
    });
    expect(resolveFlowWindow(coverage, { preset: '7d' })?.from).toEqual(d('2026-09-26T04:30:00Z'));
  });

  it('preset yang lebih panjang dari cakupan dipotong dan ditandai', () => {
    expect(resolveFlowWindow(coverage, { preset: '30d' })).toMatchObject({ from: d('2026-09-03T04:30:00Z'), clipped: false });
    const short = { windowFrom: d('2026-10-01T00:00:00Z'), windowTo: coverage.windowTo };
    expect(resolveFlowWindow(short, { preset: '30d' })).toMatchObject({ from: short.windowFrom, clipped: true, preset: '30d' });
  });

  it('rentang sendiri dipotong ke cakupan; tidak beririsan berarti tidak diketahui', () => {
    expect(resolveFlowWindow(coverage, { from: d('2026-08-01T00:00:00Z'), to: d('2026-09-10T00:00:00Z') })).toEqual({
      from: coverage.windowFrom,
      to: d('2026-09-10T00:00:00Z'),
      clipped: true,
      preset: null,
    });
    expect(resolveFlowWindow(coverage, { from: d('2026-09-05T00:00:00Z') })).toMatchObject({ clipped: false, preset: null });
    expect(resolveFlowWindow(coverage, { from: d('2026-10-10T00:00:00Z') })).toBeNull();
  });
});
