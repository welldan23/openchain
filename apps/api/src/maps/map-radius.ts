/**
 * Memotong peta tersimpan ke radius penelusuran tertentu.
 *
 * Jarak sebuah wallet adalah jumlah garis paling sedikit dari holder mana pun
 * (arah garis diabaikan): holder berjarak 0, pendana langsung dan penghubung
 * 1, pendana dari pendana 2, dan seterusnya. Garis hanya ikut bila kedua
 * ujungnya masih di dalam radius.
 */

export interface RadiusNode {
  id: number;
  role: 'holder' | 'funder' | 'connector';
}

export interface RadiusEdge {
  fromNodeId: number;
  toNodeId: number;
}

/** Jarak tiap node yang masih di dalam radius. */
export function distancesWithin(nodes: readonly RadiusNode[], edges: readonly RadiusEdge[], radius: number): Map<number, number> {
  const neighbours = new Map<number, number[]>();
  for (const edge of edges) {
    neighbours.set(edge.fromNodeId, [...(neighbours.get(edge.fromNodeId) ?? []), edge.toNodeId]);
    neighbours.set(edge.toNodeId, [...(neighbours.get(edge.toNodeId) ?? []), edge.fromNodeId]);
  }
  const distance = new Map<number, number>(nodes.filter((node) => node.role === 'holder').map((node) => [node.id, 0]));
  let frontier = [...distance.keys()];
  for (let step = 1; step <= radius && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const neighbour of neighbours.get(id) ?? []) {
        if (distance.has(neighbour)) continue;
        distance.set(neighbour, step);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return distance;
}

export function trimToRadius<N extends RadiusNode, E extends RadiusEdge>(
  nodes: readonly N[],
  edges: readonly E[],
  radius: number,
): { nodes: Array<N & { distance: number }>; edges: E[] } {
  const distance = distancesWithin(nodes, edges, radius);
  return {
    nodes: nodes.flatMap((node) => {
      const value = distance.get(node.id);
      return value === undefined ? [] : [{ ...node, distance: value }];
    }),
    edges: edges.filter((edge) => distance.has(edge.fromNodeId) && distance.has(edge.toNodeId)),
  };
}
