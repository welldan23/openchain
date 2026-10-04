import { buildMapGraph, type AddressProfile, type GraphTransfer, type HistoryCoverage, type MapGraphLoader } from './map-graph.js';

/** Loader tiruan yang meniru aturan query: urut blok, batas per address/pasangan. */
function fakeLoader(data: {
  native?: GraphTransfer[];
  token?: GraphTransfer[];
  profiles?: Record<number, Partial<AddressProfile>>;
  coverage?: Record<number, HistoryCoverage>;
}) {
  const calls = { funding: [] as Array<Array<{ addressId: number; maxBlock: number }>>, profiles: 0 };
  const byBlock = (a: GraphTransfer, b: GraphTransfer) => a.blockNumber - b.blockNumber || a.id - b.id;
  const loader: MapGraphLoader = {
    async incomingFunding(frontier, perAddress) {
      calls.funding.push([...frontier]);
      const result: GraphTransfer[] = [];
      for (const { addressId, maxBlock } of frontier) {
        const incoming = (data.native ?? [])
          .filter((t) => t.toId === addressId && t.blockNumber <= maxBlock && t.fromId !== t.toId)
          .sort(byBlock);
        result.push(...incoming.slice(0, perAddress));
      }
      return result.sort(byBlock);
    },
    async tokenTransfersAmong(ids, perPair, limit) {
      const set = new Set(ids);
      const perKey = new Map<string, number>();
      const result: GraphTransfer[] = [];
      for (const t of [...(data.token ?? [])].sort(byBlock)) {
        if (!set.has(t.fromId) || !set.has(t.toId) || t.fromId === t.toId) continue;
        const key = `${t.fromId}>${t.toId}`;
        const seen = perKey.get(key) ?? 0;
        if (seen >= perPair) continue;
        perKey.set(key, seen + 1);
        result.push(t);
      }
      return result.slice(0, limit);
    },
    async connectorCandidates(holderIds, limit) {
      const holders = new Set(holderIds);
      const links = new Map<number, Set<number>>();
      for (const t of data.token ?? []) {
        const pairs: Array<[number, number]> = [
          [t.toId, t.fromId],
          [t.fromId, t.toId],
        ];
        for (const [other, holder] of pairs) {
          if (!holders.has(holder) || holders.has(other)) continue;
          links.set(other, (links.get(other) ?? new Set()).add(holder));
        }
      }
      return [...links]
        .filter(([, linked]) => linked.size >= 2)
        .map(([addressId, linked]) => ({ addressId, holderCount: linked.size }))
        .sort((a, b) => b.holderCount - a.holderCount || a.addressId - b.addressId)
        .slice(0, limit);
    },
    async profiles(ids) {
      calls.profiles++;
      return new Map(ids.map((id) => [id, { isContract: false, hub: false, burn: false, ...data.profiles?.[id] }]));
    },
    async coverage(ids) {
      return new Map(ids.flatMap((id) => (data.coverage?.[id] ? [[id, data.coverage[id]] as const] : [])));
    },
  };
  return { loader, calls };
}

const native = (id: number, fromId: number, toId: number, blockNumber: number, source: 'native' | 'internal' = 'native'): GraphTransfer => ({
  source,
  id,
  fromId,
  toId,
  blockNumber,
});
const token = (id: number, fromId: number, toId: number, blockNumber: number): GraphTransfer => ({ source: 'token', id, fromId, toId, blockNumber });

// Holder 1–3; pendana 10, 11, 12; hub 20; address nol 99.
const HOLDERS = [
  { addressId: 1, sharePct: '20.000000' },
  { addressId: 2, sharePct: '10.000000' },
  { addressId: 3, sharePct: '5.000000' },
];
const ALL_FULL: Record<number, HistoryCoverage> = { 1: 'full', 2: 'full', 3: 'full', 10: 'full', 11: 'full', 12: 'full' };

describe('buildMapGraph', () => {
  it('menelusuri pendana per lapis sesuai urutan waktu dan menyimpan tiap kiriman sebagai garis', async () => {
    const { loader, calls } = fakeLoader({
      native: [
        native(1, 10, 1, 100),
        native(2, 10, 2, 120),
        native(3, 11, 10, 90),
        // Datang setelah pendana 10 terakhir mengirim dana: bukan modal awalnya.
        native(4, 12, 10, 130),
        native(5, 12, 11, 50, 'internal'),
      ],
      coverage: ALL_FULL,
    });
    const graph = await buildMapGraph(HOLDERS, loader, { fundingDepth: 3 });

    expect(graph.nodes.map((node) => [node.addressId, node.role, node.sharePct])).toEqual([
      [1, 'holder', '20.000000'],
      [2, 'holder', '10.000000'],
      [3, 'holder', '5.000000'],
      [10, 'funder', '0'],
      [11, 'funder', '0'],
      [12, 'funder', '0'],
    ]);
    expect(calls.funding[1]).toEqual([{ addressId: 10, maxBlock: 120 }]);
    expect(calls.funding[2]).toEqual([{ addressId: 11, maxBlock: 90 }]);
    expect(graph.edges).toEqual([
      { kind: 'funding', fromId: 10, toId: 1, nativeTransferId: 1, tokenTransferId: null },
      { kind: 'funding', fromId: 10, toId: 2, nativeTransferId: 2, tokenTransferId: null },
      { kind: 'funding', fromId: 11, toId: 10, nativeTransferId: 3, tokenTransferId: null },
      { kind: 'funding', fromId: 12, toId: 11, nativeTransferId: 5, tokenTransferId: null },
    ]);
    expect(graph.status).toBe('complete');
    expect(graph.statusReason).toBeNull();
    expect(graph.coverage).toEqual({ holders: { full: 3, partial: 0, none: 0 }, fundersIncomplete: 0, notTraversed: 0 });
  });

  it('hub dan kontrak tampil sebagai pendana tapi tidak ditelusuri; address nol diabaikan', async () => {
    const { loader, calls } = fakeLoader({
      native: [native(1, 20, 1, 100), native(2, 21, 2, 100), native(3, 99, 3, 100), native(4, 30, 20, 50)],
      profiles: { 20: { hub: true }, 21: { isContract: true }, 99: { burn: true } },
      coverage: ALL_FULL,
    });
    const graph = await buildMapGraph(HOLDERS, loader, { fundingDepth: 2 });
    expect(graph.nodes.map((node) => node.addressId)).toEqual([1, 2, 3, 20, 21]);
    expect(graph.nodes.find((node) => node.addressId === 21)?.isContract).toBe(true);
    expect(graph.edges.map((edge) => edge.nativeTransferId)).toEqual([1, 2]);
    expect(calls.funding).toHaveLength(1);
    expect(graph.coverage.notTraversed).toBe(2);
  });

  it('pengirim kiriman internal tidak ditelusuri karena dananya keluar lewat kode kontrak', async () => {
    const { loader, calls } = fakeLoader({
      native: [native(1, 10, 1, 100, 'internal'), native(2, 11, 2, 100), native(3, 30, 10, 50), native(4, 31, 11, 50)],
      coverage: ALL_FULL,
    });
    const graph = await buildMapGraph(HOLDERS, loader, { fundingDepth: 2 });
    expect(calls.funding[1]).toEqual([{ addressId: 11, maxBlock: 100 }]);
    expect(graph.nodes.map((node) => node.addressId)).toEqual([1, 2, 3, 10, 11, 31]);
    expect(graph.coverage.notTraversed).toBe(1);
  });

  it('holder berupa hub atau kontrak tidak ditelusuri pendanaannya dan tidak butuh riwayat', async () => {
    const { loader, calls } = fakeLoader({
      native: [native(1, 10, 1, 100)],
      profiles: { 1: { hub: true, isContract: true } },
      coverage: { 2: 'full', 3: 'full' },
    });
    const graph = await buildMapGraph(HOLDERS, loader, { fundingDepth: 1 });
    expect(calls.funding[0].map((item) => item.addressId)).toEqual([2, 3]);
    expect(graph.nodes.find((node) => node.addressId === 1)).toMatchObject({ role: 'holder', isContract: true });
    expect(graph.edges).toEqual([]);
    expect(graph.status).toBe('complete');
    expect(graph.coverage.notTraversed).toBe(1);
  });

  it('menambah wallet penghubung dan transfer token di antara node, tanpa hub, kontrak, atau address nol', async () => {
    const { loader } = fakeLoader({
      token: [
        token(1, 1, 40, 200),
        token(2, 40, 2, 210),
        token(3, 1, 41, 200),
        token(4, 3, 41, 200),
        token(5, 2, 50, 220),
        token(6, 3, 50, 230),
        token(7, 99, 1, 10),
        token(8, 99, 2, 10),
        token(9, 1, 2, 300),
        token(10, 1, 2, 301),
        token(11, 1, 2, 302),
        token(12, 1, 2, 303),
        token(13, 1, 60, 300),
      ],
      profiles: { 41: { hub: true }, 50: { isContract: true }, 99: { burn: true } },
      coverage: ALL_FULL,
    });
    const graph = await buildMapGraph(HOLDERS, loader, { fundingDepth: 0 });
    expect(graph.nodes.filter((node) => node.role === 'connector').map((node) => node.addressId)).toEqual([40]);
    // Per pasangan arah paling banyak 3 transfer; wallet di luar peta tidak ikut.
    expect(graph.edges.map((edge) => edge.tokenTransferId)).toEqual([1, 2, 9, 10, 11]);
    expect(graph.edges.every((edge) => edge.kind === 'token_transfer' && edge.nativeTransferId === null)).toBe(true);
    expect(graph.status).toBe('complete');
  });

  it('melaporkan riwayat holder dan pendana yang belum lengkap sebagai data sebagian', async () => {
    const { loader } = fakeLoader({
      native: [native(1, 10, 1, 100)],
      coverage: { 1: 'full', 2: 'partial' },
    });
    const graph = await buildMapGraph(HOLDERS, loader, { fundingDepth: 2 });
    expect(graph.status).toBe('partial');
    expect(graph.missingFields).toEqual(['holder_history', 'funder_history']);
    expect(graph.statusReason).toBe(
      'Riwayat 2 dari 3 holder belum lengkap (1 belum dipindai, 1 baru terbaca sebagian); pendanaan dan transfer mereka bisa belum terlihat. ' +
        'Riwayat 1 wallet pendana belum lengkap; pendana lapis berikutnya bisa belum terlihat.',
    );
    expect(graph.coverage).toEqual({ holders: { full: 1, partial: 1, none: 1 }, fundersIncomplete: 1, notTraversed: 0 });
  });

  it('menyebut batas wallet, garis, dan penghubung yang memotong peta', async () => {
    const { loader } = fakeLoader({
      native: [native(1, 10, 1, 100), native(2, 11, 2, 100), native(3, 12, 3, 100)],
      token: [
        token(1, 1, 40, 200),
        token(2, 2, 40, 200),
        token(3, 1, 41, 200),
        token(4, 2, 41, 200),
        token(5, 1, 2, 300),
        token(6, 2, 3, 301),
      ],
      coverage: ALL_FULL,
    });
    const graph = await buildMapGraph(HOLDERS, loader, { fundingDepth: 1, maxNodes: 5, maxEdges: 3, maxConnectors: 1 });
    // Pendana ketiga dan penghubung tidak muat; transfer token kedua melewati batas garis.
    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges.map((edge) => edge.nativeTransferId ?? `token:${edge.tokenTransferId}`)).toEqual([1, 2, 'token:5']);
    expect(graph.status).toBe('partial');
    expect(graph.missingFields).toEqual(['node_limit', 'edge_limit']);
    expect(graph.statusReason).toContain('Peta dibatasi 5 wallet');
    expect(graph.statusReason).toContain('Peta dibatasi 3 garis');

    const roomy = await buildMapGraph(HOLDERS, loader, { fundingDepth: 0, maxConnectors: 1 });
    expect(roomy.nodes.filter((node) => node.role === 'connector')).toHaveLength(1);
    expect(roomy.missingFields).toEqual(['connector_limit']);
  });

  it('tanpa holder, peta tidak tersedia dan alasannya disebutkan', async () => {
    const { loader, calls } = fakeLoader({});
    const graph = await buildMapGraph([], loader, { fundingDepth: 2 });
    expect(graph).toMatchObject({ status: 'unavailable', nodes: [], edges: [], missingFields: ['holders'] });
    expect(graph.statusReason).toContain('tidak punya data holder');
    expect(calls.funding).toEqual([]);
  });
});
