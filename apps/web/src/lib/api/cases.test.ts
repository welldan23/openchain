import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { caseFailureDemoPath, casePath, getCase, listCases } from "./cases";

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5_000);
  return promise;
}

describe("API kasus (mock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("mendaftar kasus terbaru dulu dan membuka satu kasus", async () => {
    const cases = await settle(listCases());
    expect(cases.map((item) => item.id)).toEqual(["bundler-nbla", "pendana-ke-base", "pembuat-kodo"]);
    expect((await settle(getCase("pembuat-kodo")))?.status).toBe("monitoring");
    expect(await settle(getCase("tidak-ada"))).toBeNull();
    expect(casePath("bundler-nbla")).toBe("/kasus/bundler-nbla");
  });

  it("melempar error untuk kasus simulasi gagal", async () => {
    const pending = getCase(caseFailureDemoPath().split("/").pop() ?? "");
    const assertion = expect(pending).rejects.toThrow(/tidak bisa dihubungi/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });
});
