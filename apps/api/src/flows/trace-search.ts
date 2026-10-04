/**
 * Pencarian jalur dana antar wallet yang menghormati urutan waktu.
 *
 * Breadth-first per langkah: jalur dengan langkah paling sedikit menang, dan
 * di antara langkah yang sama, transfer yang paling awal sampai. Setiap
 * langkah berikutnya harus terjadi pada blok yang sama atau sesudah dana
 * tiba, karena dana tidak bisa dikirim sebelum diterima. Address hub
 * (exchange, router, bridge, pool) tidak dilewati kecuali diminta, sebab dana
 * di sana tercampur dengan dana orang lain.
 */

/** Satu transfer keluar yang bisa jadi langkah jalur. */
export interface TraceEdge {
  /** Kunci unik transfer, mis. `native:12`. */
  key: string;
  fromId: number;
  toId: number;
  blockNumber: number;
  timestamp: Date;
}

/** Sumber transfer keluar; dipanggil sekali per kedalaman untuk seluruh frontier. */
export interface TraceEdgeLoader<E extends TraceEdge> {
  /**
   * Transfer keluar tiap address mulai blok minimumnya, paling awal dulu,
   * paling banyak `perAddress` per address.
   */
  outgoing(frontier: ReadonlyArray<{ addressId: number; minBlock: number }>, perAddress: number): Promise<E[]>;
  /** Address yang tidak boleh dilewati (hub), dari sekumpulan id. */
  hubs(addressIds: number[]): Promise<Set<number>>;
}

export interface TraceSearchOptions {
  maxHops: number;
  throughHubs: boolean;
  /** Transfer keluar yang diperiksa per address per langkah. */
  perAddress?: number;
  /** Batas address yang dikunjungi sebelum pencarian dihentikan. */
  maxVisited?: number;
}

export interface TraceSearchResult<E extends TraceEdge> {
  /** Langkah dari asal ke tujuan; kosong bila tidak ditemukan. */
  path: E[];
  visited: number[];
  transfersExamined: number;
  /** Ada batas (per address atau jumlah kunjungan) yang memotong pencarian. */
  truncated: boolean;
  /** Hub yang dilewati di jalur (hanya bila `throughHubs`). */
  hubsOnPath: number[];
  /** Hub yang ditemui tapi tidak dilewati. */
  hubsSkipped: number;
}

export async function searchTrace<E extends TraceEdge>(
  fromId: number,
  toId: number,
  loader: TraceEdgeLoader<E>,
  options: TraceSearchOptions,
): Promise<TraceSearchResult<E>> {
  const perAddress = options.perAddress ?? 200;
  const maxVisited = options.maxVisited ?? 2_000;
  const arrivedBy = new Map<number, E | null>([[fromId, null]]);
  const arrivalBlock = new Map<number, number>([[fromId, 0]]);
  let frontier = [fromId];
  let transfersExamined = 0;
  let truncated = false;
  let hubsSkipped = 0;
  const hubSet = new Set<number>();

  for (let depth = 1; depth <= options.maxHops && frontier.length > 0; depth++) {
    const edges = await loader.outgoing(
      frontier.map((addressId) => ({ addressId, minBlock: arrivalBlock.get(addressId) ?? 0 })),
      perAddress,
    );
    transfersExamined += edges.length;
    const perSource = new Map<number, number>();
    for (const edge of edges) perSource.set(edge.fromId, (perSource.get(edge.fromId) ?? 0) + 1);
    if ([...perSource.values()].some((count) => count >= perAddress)) truncated = true;

    // Paling awal dulu: yang pertama sampai di sebuah address menjadi jalurnya.
    const ordered = [...edges].sort((a, b) => a.blockNumber - b.blockNumber || a.key.localeCompare(b.key));
    const reached: number[] = [];
    for (const edge of ordered) {
      if (arrivedBy.has(edge.toId)) continue;
      if (arrivedBy.size >= maxVisited) {
        truncated = true;
        break;
      }
      arrivedBy.set(edge.toId, edge);
      arrivalBlock.set(edge.toId, edge.blockNumber);
      reached.push(edge.toId);
    }

    if (arrivedBy.has(toId)) {
      const path: E[] = [];
      for (let at = toId; at !== fromId; ) {
        const edge = arrivedBy.get(at);
        if (!edge) break;
        path.unshift(edge);
        at = edge.fromId;
      }
      const hubsOnPath = path.slice(0, -1).map((edge) => edge.toId).filter((id) => hubSet.has(id));
      return { path, visited: [...arrivedBy.keys()], transfersExamined, truncated, hubsOnPath, hubsSkipped };
    }

    const hubs = reached.length > 0 ? await loader.hubs(reached) : new Set<number>();
    for (const hub of hubs) hubSet.add(hub);
    if (!options.throughHubs) hubsSkipped += hubs.size;
    frontier = options.throughHubs ? reached : reached.filter((id) => !hubs.has(id));
  }

  return { path: [], visited: [...arrivedBy.keys()], transfersExamined, truncated, hubsOnPath: [], hubsSkipped };
}
