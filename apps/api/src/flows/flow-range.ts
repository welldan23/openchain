/**
 * Rentang waktu untuk endpoint aliran dana. Preset dihitung mundur dari akhir
 * cakupan pemindaian, bukan dari "sekarang", supaya hasilnya sama setiap kali
 * pemindaian yang sama dibuka. Rentang selalu dipotong ke cakupan.
 */
export type FlowRangePreset = '24h' | '7d' | '30d' | 'all';

const HOUR_MS = 60 * 60 * 1000;

export const FLOW_RANGE_PRESETS: Readonly<Record<FlowRangePreset, number | null>> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
  all: null,
};

export interface FlowRangeRequest {
  preset?: FlowRangePreset;
  from?: Date;
  to?: Date;
}

export interface ResolvedWindow {
  from: Date;
  to: Date;
  /** Permintaan melewati cakupan pemindaian dan dipotong. */
  clipped: boolean;
  /** Preset yang dipakai; `null` untuk rentang `from`/`to` sendiri. */
  preset: FlowRangePreset | null;
}

/**
 * Irisan rentang yang diminta dengan cakupan. `null` bila tidak beririsan:
 * data di luar cakupan belum diketahui, jadi tidak boleh diringkas sebagai nol.
 */
export function resolveFlowWindow(coverage: { windowFrom: Date; windowTo: Date }, request: FlowRangeRequest): ResolvedWindow | null {
  if (request.preset !== undefined) {
    const span = FLOW_RANGE_PRESETS[request.preset];
    if (span === null) return { from: coverage.windowFrom, to: coverage.windowTo, clipped: false, preset: 'all' };
    const wanted = new Date(coverage.windowTo.getTime() - span);
    const clipped = wanted < coverage.windowFrom;
    return { from: clipped ? coverage.windowFrom : wanted, to: coverage.windowTo, clipped, preset: request.preset };
  }
  const from = request.from && request.from > coverage.windowFrom ? request.from : coverage.windowFrom;
  const to = request.to && request.to < coverage.windowTo ? request.to : coverage.windowTo;
  if (from > to) return null;
  const clipped =
    (request.from !== undefined && request.from < coverage.windowFrom) || (request.to !== undefined && request.to > coverage.windowTo);
  const custom = request.from !== undefined || request.to !== undefined;
  return { from, to, clipped, preset: custom ? null : 'all' };
}
