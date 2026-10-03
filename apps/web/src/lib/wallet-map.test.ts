import { describe, expect, it } from "vitest";
import { MOCK_MAPS } from "./mock/maps";
import {
  bubbleRadius,
  CLUSTER_COLORS,
  clusterStyles,
  edgesOf,
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
    const pool = nbla.nodes.find((node) => node.label?.type === "liquidity_pool")!;
    expect(nodeColor(pool, styles)).toBe(NEUTRAL_NODE_COLOR);
  });

  it("klaster ke-4 dst. tidak diberi hue sendiri", () => {
    const many = { ...nbla, clusters: ["a", "b", "c", "d"].map((id) => ({ id, name: id, reason: "-" })) };
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
