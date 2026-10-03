import { describe, expect, it } from "vitest";
import { MOCK_TRACES } from "./mock/traces";
import type { TraceHop, WalletTrace } from "./types";
import { isConnectedPath, summarizeTrace, traceSteps } from "./wallet-trace";

const [bundlerFunding, bundlerCashOut, kodoFunding, noPath] = MOCK_TRACES;

function hop(from: string, to: string, timestamp: string): TraceHop {
  return { from, to, asset: { symbol: "ETH", address: null }, amount: 1, txHash: `0x${from}${to}`, timestamp };
}

describe("ringkasan jalur", () => {
  it("menghitung langkah, durasi, dan aset jalur", () => {
    expect(summarizeTrace(bundlerFunding)).toEqual({
      hopCount: 2,
      durationText: "38 menit",
      assets: ["ETH"],
      connected: true,
    });
    expect(summarizeTrace(bundlerCashOut)).toMatchObject({ hopCount: 2, durationText: "43 jam", connected: true });
    expect(summarizeTrace(kodoFunding).connected).toBe(true);
  });

  it("jalur kosong tidak punya durasi", () => {
    expect(summarizeTrace(noPath)).toEqual({ hopCount: 0, durationText: "–", assets: [], connected: true });
  });

  it("ujung jalur tiruan sama dengan langkah pertama dan terakhir", () => {
    for (const trace of MOCK_TRACES.filter((item) => item.hops.length > 0)) {
      expect(trace.from).toBe(trace.hops[0].from);
      expect(trace.to).toBe(trace.hops[trace.hops.length - 1].to);
    }
  });

  it("mendeteksi langkah yang tidak tersambung", () => {
    const broken: WalletTrace = {
      ...bundlerFunding,
      hops: [hop("0xa", "0xb", "2026-09-12T07:00:00.000Z"), hop("0xc", "0xd", "2026-09-12T08:00:00.000Z")],
    };
    expect(summarizeTrace(broken).connected).toBe(false);
  });

  it("menyambung address EVM tanpa peduli huruf besar/kecil, tapi tidak untuk Solana", () => {
    const hops = [hop("a", "0xAbC", "2026-09-12T07:00:00.000Z"), hop("0xabc", "d", "2026-09-12T08:00:00.000Z")];
    expect(isConnectedPath("ethereum", hops)).toBe(true);
    expect(isConnectedPath("solana", hops)).toBe(false);
  });
});

describe("langkah jalur", () => {
  it("memberi nomor dan jeda dari langkah sebelumnya", () => {
    const steps = traceSteps(bundlerFunding.hops);
    expect(steps.map((step) => [step.number, step.gapText])).toEqual([
      [1, undefined],
      [2, "38 menit"],
    ]);
  });
});
