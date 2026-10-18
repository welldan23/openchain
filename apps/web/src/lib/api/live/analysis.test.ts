import { describe, expect, it } from "vitest";
import { toFlowTransfer } from "./flows";
import { toMultichainProfile } from "./multichain";
import { toTokenInvestigation, type ApiTokenSummary } from "./tokens";

const summary: ApiTokenSummary = {
  token: { address: "0xabc", standard: "erc20", name: null, symbol: "AERO", decimals: 18, totalSupply: "1000.5", deployer: null, deployedAt: null, deployTxHash: null, sourceVerified: null },
  snapshot: {
    blockNumber: 10,
    fetchedAt: "2026-10-18T09:52:07.299Z",
    dataStatus: "partial",
    sources: [
      { provider: "base-rpc", status: "complete", errorReason: null },
      { provider: "blockscout", status: "unavailable", errorReason: "HTTP 403" },
      { provider: "blockscout", status: "unavailable", errorReason: "HTTP 403" },
    ],
  },
  dataStatus: "partial",
  market: null,
};

describe("pemetaan halaman analisis", () => {
  it("token: nilai yang belum ada tetap kosong, provider gagal jadi alasan status", () => {
    const token = toTokenInvestigation("base", summary, null, null, null, null);
    expect(token.token).toMatchObject({ name: "Token tanpa nama", deployer: null, verified: null, totalSupply: 1000.5 });
    expect(token.market.priceUsd).toBeNull();
    expect(token.risk).toEqual({ score: null, level: "unknown", findings: [] });
    expect(token.snapshot).toMatchObject({ dataStatus: "partial", statusReason: "blockscout: HTTP 403", sources: ["base-rpc", "blockscout"] });
    expect(token.holders.concentration.top10Pct).toBeNull();
  });

  it("token tanpa snapshot ditandai tidak tersedia beserta alasannya", () => {
    const token = toTokenInvestigation("base", { ...summary, snapshot: null }, null, null, null, null);
    expect(token.snapshot).toMatchObject({ dataStatus: "unavailable", statusReason: "Token ini belum pernah diambil datanya." });
  });

  it("aliran dana: transfer ke diri sendiri dilewati; jumlah tanpa decimals tidak jadi nol", () => {
    const base = { id: "t1", counterparty: { address: "0xdef", labels: [] }, asset: { type: "token" as const, address: "0xt", symbol: null, name: null, decimals: null }, amount: null, amountUsd: null, txHash: "0xh", timestamp: "2026-10-01T00:00:00Z" };
    expect(toFlowTransfer({ ...base, direction: "self" })).toBeNull();
    const transfer = toFlowTransfer({ ...base, direction: "in" })!;
    expect(Number.isNaN(transfer.amount)).toBe(true);
    expect(transfer.asset).toEqual({ symbol: "?", address: "0xt" });
    expect(transfer.amountUsd).toBeUndefined();
  });

  it("multichain: chain belum dipindai tetap kosong, chain di luar daftar frontend dilewati", () => {
    const empty = { txCount: null, inUsd: null, outUsd: null, counterpartyCount: null, firstSeen: null, lastSeen: null, balanceUsd: null, snapshotBlock: null, fetchedAt: null };
    const profile = toMultichainProfile({
      address: "0xabc",
      labels: [],
      scan: { scannedAt: "2026-10-04T00:00:00Z" },
      window: { from: "2026-01-01T00:00:00Z", to: "2026-10-04T00:00:00Z" },
      chains: [
        { chain: { id: "base" }, status: "complete", statusReason: null, ...empty, txCount: 3 },
        { chain: { id: "ethereum" }, status: "unavailable", statusReason: "Belum pernah dipindai.", ...empty },
        { chain: { id: "hyperevm" }, status: "unavailable", statusReason: null, ...empty },
      ],
      activities: [],
      activityPage: { limit: 500, truncated: false },
      bridges: [],
      sources: ["blockscout"],
    });
    expect(profile.chains.map((chain) => [chain.chain, chain.status, chain.txCount])).toEqual([
      ["base", "ok", 3],
      ["ethereum", "unavailable", null],
    ]);
    expect(profile.chains[1].statusReason).toBe("Belum pernah dipindai.");
  });
});
