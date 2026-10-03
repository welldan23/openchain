import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_FAILING_MULTICHAIN, MOCK_MULTICHAIN } from "../mock/multichain";
import { getMultichainProfile, listSampleMultichain, multichainFailureDemoPath, multichainPath } from "./multichain";

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5_000);
  return promise;
}

describe("API jelajah multichain (mock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("menemukan address tanpa peduli huruf besar/kecil", async () => {
    const [funder] = MOCK_MULTICHAIN;
    const result = await settle(getMultichainProfile(funder.address.toUpperCase().replace("0X", "0x")));
    expect(result?.address).toBe(funder.address);
  });

  it("menolak address bukan EVM dan address yang tidak dikenal", async () => {
    expect(await settle(getMultichainProfile("gfiT3SHJHGgq2bhMnP3HqRaV8dhMDvyqtvCvLok3sXPg"))).toBeNull();
    expect(await settle(getMultichainProfile(`0x${"1".repeat(40)}`))).toBeNull();
  });

  it("melempar error untuk address simulasi gagal", async () => {
    const pending = getMultichainProfile(MOCK_FAILING_MULTICHAIN);
    const assertion = expect(pending).rejects.toThrow(/tidak bisa dihubungi/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("menyediakan contoh dan tautan simulasi gagal", async () => {
    const samples = await listSampleMultichain();
    expect(samples.map((item) => item.activeChains.length)).toEqual([2, 4, 0]);
    expect(multichainFailureDemoPath()).toBe(multichainPath(MOCK_FAILING_MULTICHAIN));
  });
});
