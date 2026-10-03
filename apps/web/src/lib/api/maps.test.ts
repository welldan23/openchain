import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_FAILING_MAP, MOCK_MAPS } from "../mock/maps";
import { getWalletMap, listSampleMaps, mapFailureDemoPath, mapPath } from "./maps";

/** Jalankan pemanggilan API tiruan tanpa menunggu latensi sungguhan. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5_000);
  return promise;
}

describe("API peta hubungan wallet (mock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const [nbla, kodo] = MOCK_MAPS;

  it("menemukan peta token EVM tanpa peduli huruf besar/kecil", async () => {
    const result = await settle(getWalletMap("ethereum", nbla.token.address.toUpperCase().replace("0X", "0x")));
    expect(result?.token.symbol).toBe("NBLA");
  });

  it("membedakan huruf besar/kecil pada address Solana", async () => {
    expect((await settle(getWalletMap("solana", kodo.token.address)))?.token.symbol).toBe("KODO");
    expect(await settle(getWalletMap("solana", kodo.token.address.toLowerCase()))).toBeNull();
  });

  it("mengembalikan null untuk token yang tidak ada atau chain yang salah", async () => {
    expect(await settle(getWalletMap("ethereum", "0xdeadbeef"))).toBeNull();
    expect(await settle(getWalletMap("base", nbla.token.address))).toBeNull();
  });

  it("melempar error untuk token simulasi gagal", async () => {
    const pending = getWalletMap(MOCK_FAILING_MAP.chain, MOCK_FAILING_MAP.address);
    const assertion = expect(pending).rejects.toThrow(/tidak bisa dihubungi/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("menyediakan peta contoh dan tautan simulasi gagal", async () => {
    const samples = await listSampleMaps();
    expect(samples.map((item) => [item.symbol, item.walletCount, item.clusterCount])).toEqual([
      ["NBLA", 14, 2],
      ["KODO", 11, 1],
      ["SUNY", 0, 0],
    ]);
    expect(mapFailureDemoPath()).toBe(mapPath("arbitrum", MOCK_FAILING_MAP.address));
  });
});
