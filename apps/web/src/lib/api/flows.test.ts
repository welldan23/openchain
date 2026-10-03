import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_FAILING_FLOW, MOCK_FLOWS } from "../mock/flows";
import { flowFailureDemoPath, flowPath, getAddressFlow, listSampleFlows } from "./flows";

/** Jalankan pemanggilan API tiruan tanpa menunggu latensi sungguhan. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5_000);
  return promise;
}

describe("API aliran dana (mock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const funder = MOCK_FLOWS[0];
  const kodoCreator = MOCK_FLOWS.find((flow) => flow.chain === "solana")!;

  it("menemukan address EVM tanpa peduli huruf besar/kecil", async () => {
    const result = await settle(getAddressFlow("ethereum", funder.address.toUpperCase().replace("0X", "0x")));
    expect(result?.address).toBe(funder.address);
  });

  it("membedakan huruf besar/kecil pada address Solana", async () => {
    expect((await settle(getAddressFlow("solana", kodoCreator.address)))?.address).toBe(kodoCreator.address);
    expect(await settle(getAddressFlow("solana", kodoCreator.address.toLowerCase()))).toBeNull();
  });

  it("mengembalikan null untuk address yang tidak ada atau chain yang salah", async () => {
    expect(await settle(getAddressFlow("ethereum", "0xdeadbeef"))).toBeNull();
    expect(await settle(getAddressFlow("bsc", funder.address))).toBeNull();
  });

  it("melempar error untuk address simulasi gagal", async () => {
    const pending = getAddressFlow(MOCK_FAILING_FLOW.chain, MOCK_FAILING_FLOW.address);
    const assertion = expect(pending).rejects.toThrow(/tidak bisa dihubungi/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("menyediakan address contoh, termasuk yang belum punya transfer", async () => {
    const samples = await listSampleFlows();
    expect(samples.map((item) => [item.chain, item.transferCount])).toEqual([
      ["ethereum", 13],
      ["ethereum", 5],
      ["solana", 4],
      ["base", 0],
    ]);
    expect(flowFailureDemoPath()).toBe(flowPath("arbitrum", MOCK_FAILING_FLOW.address));
  });

  it("semua hash dan address tiruan berformat sesuai chain", () => {
    for (const flow of MOCK_FLOWS) {
      const evm = flow.chain !== "solana";
      for (const item of flow.transfers) {
        if (evm) {
          expect(item.counterparty).toMatch(/^0x[0-9a-fA-F]{40}$/);
          expect(item.txHash).toMatch(/^0x[0-9a-f]{64}$/);
        } else {
          expect(item.txHash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{88}$/);
        }
      }
    }
  });
});
