import { describe, expect, it } from "vitest";
import { describeSnapshot, snapshotPositionLabel } from "./snapshot";
import type { DataSnapshot } from "./types";

const snapshot: DataSnapshot = {
  fetchedAt: "2026-10-03T04:30:00.000Z",
  blockNumber: 23_512_880,
  sources: ["Node RPC", "DEX indexer"],
};

describe("snapshot", () => {
  it("memakai Blok untuk EVM dan Slot untuk Solana", () => {
    expect(snapshotPositionLabel("ethereum")).toBe("Blok");
    expect(snapshotPositionLabel("base")).toBe("Blok");
    expect(snapshotPositionLabel("solana")).toBe("Slot");
  });

  it("merangkum waktu, posisi, dan sumber snapshot", () => {
    const now = new Date("2026-10-03T06:30:00.000Z");
    expect(describeSnapshot(snapshot, "ethereum", now)).toEqual({
      fetchedAt: "03 Okt 2026, 11.30 WIB",
      fetchedAgo: "2 jam yang lalu",
      position: "Blok 23.512.880",
      sources: "Node RPC, DEX indexer",
    });
    expect(describeSnapshot({ ...snapshot, blockNumber: 371_204_551 }, "solana", now).position).toBe(
      "Slot 371.204.551",
    );
  });

  it("menampilkan placeholder bila sumber kosong", () => {
    expect(describeSnapshot({ ...snapshot, sources: [] }, "ethereum").sources).toBe("–");
  });
});
