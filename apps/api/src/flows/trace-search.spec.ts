import { searchTrace, type TraceEdge, type TraceEdgeLoader } from './trace-search.js';

/** Graf kecil dalam memori: [dari, ke, blok]. */
function graph(edges: Array<[number, number, number]>, hubIds: number[] = []): TraceEdgeLoader<TraceEdge> & { calls: number } {
  const loader = {
    calls: 0,
    async outgoing(frontier: ReadonlyArray<{ addressId: number; minBlock: number }>, perAddress: number) {
      loader.calls += 1;
      return frontier.flatMap(({ addressId, minBlock }) =>
        edges
          .filter(([from, , block]) => from === addressId && block >= minBlock)
          .sort((a, b) => a[2] - b[2])
          .slice(0, perAddress)
          .map(([from, to, block], index) => ({
            key: `${from}-${to}-${block}-${index}`,
            fromId: from,
            toId: to,
            blockNumber: block,
            timestamp: new Date(block * 1000),
          })),
      );
    },
    async hubs(ids: number[]) {
      return new Set(ids.filter((id) => hubIds.includes(id)));
    },
  };
  return loader;
}

const route = (path: TraceEdge[]) => path.map((edge) => `${edge.fromId}>${edge.toId}@${edge.blockNumber}`);

describe('pencarian jalur dana', () => {
  it('menemukan jalur dengan langkah paling sedikit', async () => {
    const result = await searchTrace(1, 4, graph([[1, 2, 10], [2, 3, 20], [3, 4, 30], [1, 5, 11], [5, 4, 12]]), { maxHops: 4, throughHubs: false });
    expect(route(result.path)).toEqual(['1>5@11', '5>4@12']);
  });

  it('menghormati urutan waktu: dana tidak bisa diteruskan sebelum diterima', async () => {
    // 2 menerima di blok 50 tapi mengirim ke 3 di blok 40: bukan jalur.
    const loader = graph([[1, 2, 50], [2, 3, 40], [2, 3, 60]]);
    const result = await searchTrace(1, 3, loader, { maxHops: 3, throughHubs: false });
    expect(route(result.path)).toEqual(['1>2@50', '2>3@60']);
    const none = await searchTrace(1, 3, graph([[1, 2, 50], [2, 3, 40]]), { maxHops: 3, throughHubs: false });
    expect(none.path).toEqual([]);
  });

  it('di antara jalur sepanjang sama, memilih yang paling awal sampai', async () => {
    const result = await searchTrace(1, 9, graph([[1, 2, 10], [1, 3, 5], [2, 9, 30], [3, 9, 20]]), { maxHops: 2, throughHubs: false });
    expect(route(result.path)).toEqual(['1>3@5', '3>9@20']);
  });

  it('tidak melewati hub kecuali diminta, tapi hub boleh jadi tujuan', async () => {
    const edges: Array<[number, number, number]> = [[1, 7, 10], [7, 4, 20]];
    const blocked = await searchTrace(1, 4, graph(edges, [7]), { maxHops: 3, throughHubs: false });
    expect(blocked.path).toEqual([]);
    expect(blocked.hubsSkipped).toBe(1);
    const allowed = await searchTrace(1, 4, graph(edges, [7]), { maxHops: 3, throughHubs: true });
    expect(route(allowed.path)).toEqual(['1>7@10', '7>4@20']);
    expect(allowed.hubsOnPath).toEqual([7]);
    const toHub = await searchTrace(1, 7, graph(edges, [7]), { maxHops: 3, throughHubs: false });
    expect(route(toHub.path)).toEqual(['1>7@10']);
  });

  it('berhenti di batas langkah dan tidak mengulang address yang sudah dikunjungi', async () => {
    const loader = graph([[1, 2, 1], [2, 1, 2], [2, 3, 3], [3, 4, 4], [4, 5, 5]]);
    const result = await searchTrace(1, 5, loader, { maxHops: 3, throughHubs: false });
    expect(result.path).toEqual([]);
    expect(loader.calls).toBe(3);
    expect(result.visited.sort()).toEqual([1, 2, 3, 4]);
  });

  it('menandai pencarian terpotong bila batas per address atau batas kunjungan tercapai', async () => {
    const wide = graph(Array.from({ length: 5 }, (_, index): [number, number, number] => [1, 10 + index, index + 1]));
    expect((await searchTrace(1, 99, wide, { maxHops: 1, throughHubs: false, perAddress: 3 })).truncated).toBe(true);
    expect((await searchTrace(1, 99, wide, { maxHops: 1, throughHubs: false, maxVisited: 2 })).truncated).toBe(true);
    expect((await searchTrace(1, 99, wide, { maxHops: 1, throughHubs: false })).truncated).toBe(false);
  });
});
