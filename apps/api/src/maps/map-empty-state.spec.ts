import { mapEmptyState, type EmptyStateInput } from './map-empty-state.js';

const base: EmptyStateInput = {
  symbol: 'NBLA',
  hasSnapshot: true,
  storedNodes: 10,
  storedEdges: 12,
  shownNodes: 10,
  shownEdges: 12,
  historyIncomplete: false,
  filterActive: false,
  radius: 2,
};

describe('mapEmptyState', () => {
  it('tidak ada empty state bila wallet dan garis tampil', () => {
    expect(mapEmptyState(base)).toBeNull();
  });

  it('membedakan snapshot yang belum ada dan snapshot tanpa holder', () => {
    expect(mapEmptyState({ ...base, hasSnapshot: false, storedNodes: 0 })).toMatchObject({
      reason: 'no_snapshot',
      scope: 'nodes',
      actions: ['ingest_token'],
      message: expect.stringContaining('bukan berarti token aman'),
    });
    expect(mapEmptyState({ ...base, storedNodes: 0, storedEdges: 0, shownNodes: 0, shownEdges: 0 })).toMatchObject({ reason: 'no_holders' });
  });

  it('menyebut filter bila semua wallet atau semua garis tersembunyi', () => {
    expect(mapEmptyState({ ...base, shownNodes: 0, shownEdges: 0 })).toMatchObject({ reason: 'filtered_out', scope: 'nodes', actions: ['reset_filter'] });
    expect(mapEmptyState({ ...base, shownEdges: 0, radius: 0 })).toMatchObject({
      reason: 'filtered_out',
      scope: 'edges',
      actions: ['widen_radius'],
      nextSteps: ['Naikkan radius supaya pendana dan penghubung ikut tampil.'],
    });
    expect(mapEmptyState({ ...base, shownEdges: 0, filterActive: true })?.actions).toEqual(['reset_filter']);
  });

  it('membedakan riwayat yang belum dipindai dari holder yang memang tidak saling terhubung', () => {
    const noEdges = { ...base, storedEdges: 0, shownEdges: 0 };
    expect(mapEmptyState({ ...noEdges, historyIncomplete: true })).toMatchObject({ reason: 'no_history', scope: 'edges', actions: ['collect_holder_history'] });
    expect(mapEmptyState(noEdges)).toMatchObject({ reason: 'no_connections', actions: [], message: expect.stringContaining('bukan bukti') });
  });
});
