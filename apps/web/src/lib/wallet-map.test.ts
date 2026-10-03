import { describe, expect, it } from "vitest";
import { MOCK_MAPS } from "./mock/maps";
import {
  bubbleRadius,
  clusterHull,
  CLUSTER_COLORS,
  clusterStyles,
  coordinationMembership,
  describeCoordinationWindow,
  sameBlockCount,
  sortCoordination,
  sortCoordinationTxs,
  edgesOf,
  EMPTY_LABEL_FILTER,
  isLabelFilterActive,
  labelFilterParams,
  labelTypeCounts,
  matchesLabelFilter,
  parseLabelFilter,
  hullLabelPosition,
  hullPath,
  layersFrom,
  layoutWalletMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  neighborsOf,
  NEUTRAL_NODE_COLOR,
  nodeColor,
  parseLayerParam,
  summarizeMap,
} from "./wallet-map";

const [nbla, kodo] = MOCK_MAPS;

describe("ukuran gelembung", () => {
  it("luas sebanding porsi supply, wallet penghubung tetap terlihat", () => {
    expect(bubbleRadius(18.4, 18.4)).toBe(46);
    expect(bubbleRadius(4.6, 18.4)).toBeCloseTo(9 + 37 * 0.5);
    expect(bubbleRadius(0, 18.4)).toBe(6);
  });
});

describe("data peta tiruan", () => {
  it("garis hanya menghubungkan wallet yang ada di peta", () => {
    for (const map of MOCK_MAPS) {
      const onMap = new Set(map.nodes.map((node) => node.address));
      expect(map.edges.length).toBeGreaterThan(0);
      expect(map.edges.every((edge) => onMap.has(edge.from) && onMap.has(edge.to))).toBe(true);
    }
  });

  it("garis pendanaan memakai native coin, garis token memakai token", () => {
    expect(nbla.edges.filter((edge) => edge.kind === "funding").every((edge) => edge.asset.address === null)).toBe(true);
    expect(nbla.edges.filter((edge) => edge.kind === "token_transfer").map((edge) => edge.asset.symbol)).toEqual(
      expect.arrayContaining(["NBLA"]),
    );
  });
});

describe("klaster dan ringkasan", () => {
  it("memberi warna klaster sesuai urutan dan menghitung porsinya", () => {
    const styles = clusterStyles(nbla);
    expect(styles.map((style) => [style.cluster.id, style.color, style.memberCount, style.sharePct])).toEqual([
      ["nbla-pendana-bersama", CLUSTER_COLORS[0], 6, 14.9],
      ["nbla-lingkaran-deployer", CLUSTER_COLORS[1], 3, 21.4],
    ]);
    // Pendanaan ke anggota: 12 ETH ke pendana + 5 kiriman ke bundler + 2 ETH yang kembali ke pendana.
    expect(styles[0]).toMatchObject({ fundingUsd: 29_400 + 25_235 + 9_310 + 7_105, internalLinkCount: 8 });
    // Deployer menerima 10 ETH dari hot wallet exchange.
    expect(styles[1]).toMatchObject({ fundingUsd: 24_500, internalLinkCount: 2 });
    const pool = nbla.nodes.find((node) => node.label?.type === "liquidity_pool")!;
    expect(nodeColor(pool, styles)).toBe(NEUTRAL_NODE_COLOR);
  });

  it("klaster ke-4 dst. tidak diberi hue sendiri", () => {
    const many = { ...nbla, clusters: ["a", "b", "c", "d"].map((id) => ({ ...nbla.clusters[0], id, name: id })) };
    expect(clusterStyles(many).map((style) => style.color)).toEqual([...CLUSTER_COLORS, null]);
  });

  it("merangkum jumlah wallet, holder, klaster, garis, dan porsi terkelompok", () => {
    expect(summarizeMap(nbla)).toEqual({
      walletCount: 14,
      holderCount: 13,
      clusterCount: 2,
      linkCount: nbla.edges.length,
      clusteredSharePct: 36.3,
    });
  });

  it("mencari garis dan tetangga sebuah wallet", () => {
    const funder = nbla.nodes.find((node) => node.sharePct === 0)!;
    expect(neighborsOf(nbla.chain, nbla.edges, funder.address).size).toBe(6);
    expect(edgesOf(nbla.chain, nbla.edges, funder.address.toUpperCase().replace("0X", "0x")).length).toBeGreaterThan(5);
  });
});

describe("tata letak", () => {
  for (const map of [nbla, kodo]) {
    it(`gelembung ${map.token.symbol} tidak bertumpuk dan ada di dalam kanvas`, () => {
      const placed = layoutWalletMap(map);
      expect(placed).toHaveLength(map.nodes.length);
      for (const item of placed) {
        expect(item.x - item.r).toBeGreaterThanOrEqual(0);
        expect(item.x + item.r).toBeLessThanOrEqual(MAP_WIDTH);
        expect(item.y - item.r).toBeGreaterThanOrEqual(0);
        expect(item.y + item.r).toBeLessThanOrEqual(MAP_HEIGHT);
      }
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r + 2);
        }
      }
    });
  }

  it("deterministik: peta yang sama selalu punya posisi yang sama", () => {
    expect(layoutWalletMap(nbla)).toEqual(layoutWalletMap(nbla));
  });
});

describe("penelusuran lapis dari wallet pusat", () => {
  const funder = nbla.nodes.find((node) => node.sharePct === 0)!;
  const pool = nbla.nodes.find((node) => node.label?.type === "liquidity_pool")!;
  const whale = nbla.nodes.find((node) => node.label?.type === "whale")!;

  it("menghitung jarak lapis tanpa peduli arah garis", () => {
    const one = layersFrom(nbla.chain, nbla.edges, funder.address, 1);
    expect(one.get(funder.address.toLowerCase())).toBe(0);
    // Pendana terhubung langsung ke 5 bundler dan hot wallet exchange.
    expect([...one.values()].filter((depth) => depth === 1)).toHaveLength(6);
    expect(one.has(pool.address.toLowerCase())).toBe(false);
  });

  it("lapis lebih dalam menjangkau lebih banyak wallet, wallet tanpa garis tidak pernah terjangkau", () => {
    const three = layersFrom(nbla.chain, nbla.edges, funder.address, 3);
    expect(three.get(pool.address.toLowerCase())).toBe(3);
    const all = layersFrom(nbla.chain, nbla.edges, funder.address, null);
    expect(all.size).toBeGreaterThanOrEqual(three.size);
    expect(all.has(whale.address.toLowerCase())).toBe(false);
  });

  it("membaca pilihan lapis dari URL", () => {
    expect(parseLayerParam("2")).toBe(2);
    expect(parseLayerParam("9")).toBeNull();
    expect(parseLayerParam(undefined)).toBeNull();
  });
});

describe("area kelompok", () => {
  const members = [
    { x: 100, y: 100, r: 10 },
    { x: 200, y: 120, r: 20 },
    { x: 150, y: 200, r: 15 },
  ];

  it("membungkus semua gelembung anggota beserta jaraknya", () => {
    const hull = clusterHull(members);
    const xs = hull.map((point) => point[0]);
    const ys = hull.map((point) => point[1]);
    expect(Math.min(...xs)).toBeCloseTo(80);
    expect(Math.max(...xs)).toBeCloseTo(230);
    expect(Math.min(...ys)).toBeCloseTo(80, 0);
    expect(Math.max(...ys)).toBeCloseTo(225);
  });

  it("bentuknya cembung: semua titik sampel ada di dalam atau di tepinya", () => {
    const hull = clusterHull(members);
    const inside = (px: number, py: number) =>
      hull.every((a, i) => {
        const b = hull[(i + 1) % hull.length];
        return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) >= -1e-6;
      });
    for (const member of members) expect(inside(member.x, member.y)).toBe(true);
  });

  it("satu anggota menjadi lingkaran, path dan label siap pakai", () => {
    const hull = clusterHull([{ x: 50, y: 30, r: 5 }]);
    expect(hull).toHaveLength(16);
    expect(hullPath(hull)).toMatch(/^M[\d.,L-]+Z$/);
    expect(hullLabelPosition(hull)).toEqual({ x: 60, y: 12 });
  });
});

describe("filter label entitas", () => {
  const exchange = nbla.nodes.find((node) => node.label?.type === "exchange")!;
  const unlabeled = nbla.nodes.find((node) => !node.label)!;
  const bundler = nbla.nodes.find((node) => node.label?.type === "bot")!;

  it("menghitung jenis label di peta, tanpa label paling akhir", () => {
    const counts = labelTypeCounts(nbla.nodes);
    expect(counts[0]).toEqual({ key: "bot", count: 5 });
    expect(counts.at(-1)).toEqual({ key: "none", count: 3 });
    expect(counts.reduce((sum, item) => sum + item.count, 0)).toBe(nbla.nodes.length);
  });

  it("menyembunyikan jenis tertentu dan menyaring menurut sumber", () => {
    const hideExchange = { hiddenTypes: new Set(["exchange" as const]), source: "all" as const };
    expect(matchesLabelFilter(exchange, hideExchange)).toBe(false);
    expect(matchesLabelFilter(bundler, hideExchange)).toBe(true);
    const externalOnly = { ...EMPTY_LABEL_FILTER, source: "external" as const };
    expect(matchesLabelFilter(exchange, externalOnly)).toBe(true);
    expect(matchesLabelFilter(bundler, externalOnly)).toBe(false);
    expect(matchesLabelFilter(unlabeled, externalOnly)).toBe(false);
    expect(isLabelFilterActive(EMPTY_LABEL_FILTER)).toBe(false);
    expect(isLabelFilterActive(externalOnly)).toBe(true);
  });

  it("membaca dan menulis filter di URL, nilai asing diabaikan", () => {
    const filter = parseLabelFilter("exchange,none,palsu", "dugaan");
    expect([...filter.hiddenTypes].sort()).toEqual(["exchange", "none"]);
    expect(filter.source).toBe("heuristic");
    expect(labelFilterParams(filter)).toEqual({ sembunyikan: "exchange,none", sumber: "dugaan" });
    expect(labelFilterParams(EMPTY_LABEL_FILTER)).toEqual({ sembunyikan: undefined, sumber: undefined });
    expect(parseLabelFilter(undefined, "aneh")).toEqual(EMPTY_LABEL_FILTER);
  });
});

describe("deteksi koordinasi", () => {
  it("mencatat kejadian koordinasi per wallet", () => {
    const membership = coordinationMembership(nbla.chain, nbla);
    const funder = nbla.nodes.find((node) => node.sharePct === 0)!;
    const bundler = nbla.nodes.find((node) => node.label?.type === "bot")!;
    expect(membership.get(funder.address.toLowerCase())).toEqual(["nbla-funding-burst"]);
    expect(membership.get(bundler.address.toLowerCase())).toHaveLength(3);
    expect(membership.has(nbla.nodes.find((node) => node.label?.type === "liquidity_pool")!.address.toLowerCase())).toBe(false);
  });

  it("anggota koordinasi semuanya ada di peta", () => {
    for (const map of MOCK_MAPS) {
      const onMap = new Set(map.nodes.map((node) => node.address));
      for (const event of map.coordination) expect(event.members.every((member) => onMap.has(member))).toBe(true);
    }
  });

  it("menjelaskan rentang waktu dan mengurutkan dari yang terkuat", () => {
    expect(describeCoordinationWindow(0)).toBe("di blok yang sama");
    expect(describeCoordinationWindow(0, "slot")).toBe("di slot yang sama");
    expect(describeCoordinationWindow(45)).toBe("dalam 45 detik");
    expect(describeCoordinationWindow(540)).toBe("dalam 9 menit");
    expect(describeCoordinationWindow(7200)).toBe("dalam 2 jam");
    expect(sortCoordination(nbla.coordination).map((event) => event.id)).toEqual([
      "nbla-same-block-buy",
      "nbla-funding-burst",
      "nbla-similar-amount",
    ]);
  });
});

describe("transaksi pendukung koordinasi", () => {
  const sameBlock = nbla.coordination.find((event) => event.kind === "same_block_buy")!;

  it("semua transaksi beli di blok peluncuran, bersama penambahan likuiditas", () => {
    // Tambah likuiditas memindahkan ETH dan NBLA dalam satu transaksi, jadi dua baris.
    expect(sameBlock.transactions.map((tx) => tx.action)).toEqual([
      "add_liquidity",
      "add_liquidity",
      "buy",
      "buy",
      "buy",
      "buy",
      "buy",
    ]);
    expect(new Set(sameBlock.transactions.map((tx) => tx.blockNumber)).size).toBe(1);
    expect(sameBlockCount(sameBlock.transactions)).toBe(7);
  });

  it("pendanaan beruntun berurutan dalam 9 menit di blok berbeda", () => {
    const burst = nbla.coordination.find((event) => event.kind === "funding_burst")!;
    const sorted = sortCoordinationTxs(burst.transactions);
    expect(sorted).toHaveLength(5);
    expect(Date.parse(sorted[4].timestamp) - Date.parse(sorted[0].timestamp)).toBe(9 * 60 * 1000);
    expect(sorted[4].blockNumber - sorted[0].blockNumber).toBe(45);
    expect(sameBlockCount(sorted)).toBe(0);
  });

  it("mengurutkan menurut blok lalu waktu", () => {
    const txs = [
      { id: "b", blockNumber: 2, timestamp: "2026-01-01T00:00:00Z" },
      { id: "a", blockNumber: 1, timestamp: "2026-01-01T00:05:00Z" },
      { id: "c", blockNumber: 2, timestamp: "2026-01-01T00:00:00Z" },
    ];
    expect(sortCoordinationTxs(txs).map((tx) => tx.id)).toEqual(["a", "b", "c"]);
  });
});
