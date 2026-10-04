import {
  clusterWallets,
  type ClusterEdge,
  type ClusterLoader,
  type ClusterNode,
  type EvidenceTransfer,
  type WalletCluster,
} from './wallet-clustering.js';

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const minute = (value: number) => new Date(T0 + value * 60_000);

// Node id = address id; address dibuat dari id supaya mudah dibaca di tes.
function node(id: number, role: ClusterNode['role'], extra: Partial<ClusterNode> = {}): ClusterNode {
  return { id, addressId: id, address: `0x${String(id).padStart(40, '0')}`, role, sharePct: role === 'holder' ? 10 : 0, isContract: false, hub: false, ...extra };
}

let transferSeq = 0;
function funding(from: number, to: number, at = 0, source: ClusterEdge['source'] = 'native'): ClusterEdge {
  return { kind: 'funding', source, transferId: ++transferSeq, fromNodeId: from, toNodeId: to, blockNumber: 100 + at, timestamp: minute(at) };
}
function tokenEdge(from: number, to: number, at = 0): ClusterEdge {
  return { kind: 'token_transfer', source: 'token', transferId: ++transferSeq, fromNodeId: from, toNodeId: to, blockNumber: 500 + at, timestamp: minute(at) };
}
function evidence(table: 'native' | 'token', id: number, from: number, to: number, blockNumber: number): EvidenceTransfer {
  return { table, id, fromAddressId: from, toAddressId: to, blockNumber, timestamp: minute(blockNumber) };
}

function loader(data: { receipts?: EvidenceTransfer[]; transfers?: EvidenceTransfer[] } = {}): ClusterLoader {
  return {
    async firstReceipts(ids) {
      return (data.receipts ?? []).filter((receipt) => ids.includes(receipt.toAddressId));
    },
    async transfersBetween(fromIds, toIds) {
      return (data.transfers ?? []).filter((transfer) => fromIds.includes(transfer.fromAddressId) && toIds.includes(transfer.toAddressId));
    },
  };
}

const run = (nodes: ClusterNode[], edges: ClusterEdge[], data?: Parameters<typeof loader>[0], deployerAddressId: number | null = null, mapComplete = true) =>
  clusterWallets({ nodes, edges, deployerAddressId, mapComplete }, loader(data));

const signal = (cluster: WalletCluster, key: string) => cluster.signals.find((item) => item.key === key)!;

describe('clusterWallets', () => {
  it('menyatukan holder dengan pendana yang sama dan mencatat sinyal beserta buktinya', async () => {
    const nodes = [node(1, 'holder', { sharePct: 20 }), node(2, 'holder'), node(10, 'funder')];
    const edges = [funding(10, 1, 0), funding(10, 2, 5)];
    const [cluster, ...rest] = await run(nodes, edges, {
      receipts: [evidence('token', 900, 50, 1, 700), evidence('token', 901, 50, 2, 700)],
      transfers: [evidence('native', 902, 2, 10, 800)],
    });
    expect(rest).toEqual([]);
    expect(cluster).toMatchObject({
      key: `kelompok-${nodes[0].address}`,
      name: 'Kelompok A',
      memberNodeIds: [1, 2, 10],
      labels: ['common_funding', 'likely_linked', 'bundled_or_sniper_activity'],
      confidence: 'high',
      hasDirectEvidence: false,
    });
    expect(signal(cluster, 'common-funder')).toMatchObject({ matched: true, detail: expect.stringContaining('2 wallet menerima dana langsung') });
    expect(signal(cluster, 'common-funder').evidence).toEqual(edges.map((edge) => ({ table: 'native', id: edge.transferId })));
    expect(signal(cluster, 'funding-window')).toMatchObject({ matched: true, detail: '2 wallet didanai dalam 5 menit.' });
    expect(signal(cluster, 'same-block-receive')).toMatchObject({
      matched: true,
      evidence: [
        { table: 'token', id: 900 },
        { table: 'token', id: 901 },
      ],
    });
    expect(signal(cluster, 'consolidation')).toMatchObject({ matched: true, evidence: [{ table: 'native', id: 902 }] });
    expect(signal(cluster, 'direct-transfer').matched).toBe(false);
    expect(signal(cluster, 'deployer-link')).toMatchObject({ matched: false, detail: expect.stringContaining('belum diketahui') });
    expect(cluster.reason).toContain('2 wallet menerima dana langsung');
    expect(cluster.caveats[0]).toContain('belum tentu pemilik yang sama');
  });

  it('exchange, kontrak, dan pengirim kiriman internal tidak menyatukan wallet', async () => {
    const nodes = [
      node(1, 'holder'),
      node(2, 'holder'),
      node(3, 'holder'),
      node(4, 'holder'),
      node(5, 'holder'),
      node(6, 'holder'),
      node(10, 'funder', { hub: true }),
      node(11, 'funder', { isContract: true }),
      node(12, 'funder'),
    ];
    const edges = [funding(10, 1), funding(10, 2), funding(11, 3), funding(11, 4), funding(12, 5, 0, 'internal'), funding(12, 6, 0, 'internal')];
    expect(await run(nodes, edges)).toEqual([]);
  });

  it('holder pemegang kontrak atau exchange tidak ikut dikelompokkan walau saling kirim', async () => {
    const nodes = [node(1, 'holder', { isContract: true }), node(2, 'holder'), node(3, 'holder', { hub: true })];
    expect(await run(nodes, [tokenEdge(1, 2), tokenEdge(3, 2)])).toEqual([]);
  });

  it('pendana bersama beberapa lapis ke belakang ikut menyatukan, beserta perantaranya', async () => {
    const nodes = [node(1, 'holder'), node(2, 'holder'), node(10, 'funder'), node(11, 'funder'), node(20, 'funder')];
    const [cluster] = await run(nodes, [funding(10, 1, 0), funding(11, 2, 200), funding(20, 10, -10), funding(20, 11, -5)]);
    expect(cluster.memberNodeIds).toEqual([1, 2, 10, 11, 20]);
    expect(signal(cluster, 'common-funder').detail).toContain('lewat 1 lapis perantara');
    // Pendanaan langsung terpaut 200 menit: tidak berdekatan.
    expect(signal(cluster, 'funding-window').matched).toBe(false);
    expect(cluster.labels).toEqual(['common_funding', 'false_positive_possible']);
    expect(cluster.confidence).toBe('low');
  });

  it('wallet perantara saja hanya menghasilkan kelompok visual yang belum meyakinkan', async () => {
    const nodes = [node(1, 'holder'), node(2, 'holder'), node(30, 'connector')];
    const [cluster] = await run(nodes, [tokenEdge(1, 30), tokenEdge(30, 2)], undefined, null, false);
    expect(cluster).toMatchObject({ memberNodeIds: [1, 2, 30], labels: ['visual_cluster', 'inconclusive'], confidence: 'low' });
    expect(signal(cluster, 'shared-connector')).toMatchObject({ matched: true });
    expect(signal(cluster, 'shared-connector').evidence).toHaveLength(2);
    expect(cluster.caveats.join(' ')).toContain('hanya terhubung lewat wallet perantara');
    expect(cluster.caveats.join(' ')).toContain('Data peta belum lengkap');
  });

  it('label orang dalam hanya dengan transfer langsung dari deployer', async () => {
    const nodes = [node(1, 'holder'), node(2, 'holder')];
    const edges = [tokenEdge(1, 2)];
    const [plain] = await run(nodes, edges, { transfers: [evidence('token', 950, 99, 1, 400)] });
    expect(plain.labels).not.toContain('insider_or_team');

    const [insider] = await run(nodes, edges, { transfers: [evidence('token', 950, 99, 1, 400)] }, 99);
    expect(insider).toMatchObject({ hasDirectEvidence: true, confidence: 'high' });
    expect(insider.labels).toEqual(['likely_linked', 'insider_or_team']);
    expect(signal(insider, 'deployer-link')).toMatchObject({ matched: true, evidence: [{ table: 'token', id: 950 }] });
    expect(insider.caveats.join(' ')).toContain('belum membuktikan niat menjual bersama');
  });

  it('pendana yang menyatukan banyak holder diberi tanda kemungkinan keliru; holder sendirian tidak jadi kelompok', async () => {
    const holders = Array.from({ length: 10 }, (_, index) => node(index + 1, 'holder'));
    const nodes = [...holders, node(50, 'funder'), node(60, 'holder'), node(61, 'funder')];
    const edges = [...holders.map((holder, index) => funding(50, holder.id, index)), funding(61, 60)];
    const clusters = await run(nodes, edges);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].labels).toContain('false_positive_possible');
    expect(clusters[0].caveats.join(' ')).toContain('menyatukan 10 holder sekaligus');
  });

  it('mengurutkan kelompok dari porsi supply terbesar', async () => {
    const nodes = [node(1, 'holder', { sharePct: 1 }), node(2, 'holder', { sharePct: 1 }), node(3, 'holder', { sharePct: 30 }), node(4, 'holder', { sharePct: 5 })];
    const clusters = await run(nodes, [tokenEdge(1, 2), tokenEdge(3, 4)]);
    expect(clusters.map((cluster) => [cluster.name, cluster.memberNodeIds])).toEqual([
      ['Kelompok A', [3, 4]],
      ['Kelompok B', [1, 2]],
    ]);
  });
});
