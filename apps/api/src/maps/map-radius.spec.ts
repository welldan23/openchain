import { distancesWithin, trimToRadius } from './map-radius.js';

// 1–2 holder; 3 mendanai 1; 4 mendanai 3; 5 penghubung 1↔2; 6 terpisah dari semua holder.
const nodes = [
  { id: 1, role: 'holder' as const },
  { id: 2, role: 'holder' as const },
  { id: 3, role: 'funder' as const },
  { id: 4, role: 'funder' as const },
  { id: 5, role: 'connector' as const },
  { id: 6, role: 'funder' as const },
];
const edges = [
  { fromNodeId: 3, toNodeId: 1 },
  { fromNodeId: 4, toNodeId: 3 },
  { fromNodeId: 1, toNodeId: 5 },
  { fromNodeId: 5, toNodeId: 2 },
  { fromNodeId: 1, toNodeId: 2 },
];

describe('radius peta', () => {
  it('menghitung langkah terpendek dari holder mana pun, tanpa melihat arah garis', () => {
    expect([...distancesWithin(nodes, edges, 5)]).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
      [5, 1],
      [4, 2],
    ]);
  });

  it('memotong node di luar radius beserta garisnya', () => {
    const one = trimToRadius(nodes, edges, 1);
    expect(one.nodes).toEqual([
      { id: 1, role: 'holder', distance: 0 },
      { id: 2, role: 'holder', distance: 0 },
      { id: 3, role: 'funder', distance: 1 },
      { id: 5, role: 'connector', distance: 1 },
    ]);
    expect(one.edges).not.toContainEqual({ fromNodeId: 4, toNodeId: 3 });
    expect(trimToRadius(nodes, edges, 0).edges).toEqual([{ fromNodeId: 1, toNodeId: 2 }]);
  });
});
