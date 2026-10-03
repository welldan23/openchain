import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_FLOWS } from "../mock/flows";
import { MOCK_FAILING_TRACE, MOCK_TRACES } from "../mock/traces";
import { getWalletTrace, listSampleTraces, listTracesForAddress, traceFailureDemoPath, tracePath } from "./traces";

/** Jalankan pemanggilan API tiruan tanpa menunggu latensi sungguhan. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5_000);
  return promise;
}

describe("API telusur antar wallet (mock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const [first] = MOCK_TRACES;
  const kodo = MOCK_TRACES.find((trace) => trace.chain === "solana")!;

  it("menemukan jalur EVM tanpa peduli huruf besar/kecil", async () => {
    const result = await settle(getWalletTrace("ethereum", first.from.toUpperCase().replace("0X", "0x"), first.to));
    expect(result?.hops).toHaveLength(2);
  });

  it("membedakan huruf besar/kecil pada address Solana", async () => {
    expect(await settle(getWalletTrace("solana", kodo.from, kodo.to))).not.toBeNull();
    expect(await settle(getWalletTrace("solana", kodo.from.toLowerCase(), kodo.to))).toBeNull();
  });

  it("arah jalur penting: asal dan tujuan tidak bisa ditukar", async () => {
    expect(await settle(getWalletTrace("ethereum", first.to, first.from))).toBeNull();
  });

  it("melempar error untuk jalur simulasi gagal", async () => {
    const pending = getWalletTrace(MOCK_FAILING_TRACE.chain, MOCK_FAILING_TRACE.from, MOCK_FAILING_TRACE.to);
    const assertion = expect(pending).rejects.toThrow(/tidak bisa dihubungi/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("menyediakan jalur contoh, termasuk yang tidak terhubung", async () => {
    const samples = await listSampleTraces();
    expect(samples.map((item) => [item.chain, item.hopCount])).toEqual([
      ["ethereum", 2],
      ["ethereum", 2],
      ["solana", 2],
      ["ethereum", 0],
    ]);
    expect(traceFailureDemoPath()).toBe(tracePath("arbitrum", MOCK_FAILING_TRACE.from, MOCK_FAILING_TRACE.to));
  });

  it("mencari jalur yang melewati sebuah address", async () => {
    const funder = MOCK_FLOWS.find((flow) => flow.label?.name === "Pendana bersama 5 wallet")!;
    expect(await listTracesForAddress("ethereum", funder.address)).toHaveLength(2);
    expect(await listTracesForAddress("base", funder.address)).toEqual([]);
  });
});
