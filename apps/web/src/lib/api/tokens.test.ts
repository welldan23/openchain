import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_FAILING_TOKEN, MOCK_TOKENS } from "../mock/tokens";
import { failureDemoPath, getTokenInvestigation, listSampleTokens, tokenPath } from "./tokens";

/** Jalankan pemanggilan API tiruan tanpa menunggu latensi sungguhan. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5_000);
  return promise;
}

describe("API token (mock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const nebula = MOCK_TOKENS.find((item) => item.token.symbol === "NBLA")!;
  const kodo = MOCK_TOKENS.find((item) => item.token.symbol === "KODO")!;

  it("menemukan token EVM tanpa peduli huruf besar/kecil address", async () => {
    const result = await settle(
      getTokenInvestigation("ethereum", nebula.token.address.toUpperCase()),
    );
    expect(result?.token.symbol).toBe("NBLA");
  });

  it("membedakan huruf besar/kecil pada address Solana", async () => {
    expect((await settle(getTokenInvestigation("solana", kodo.token.address)))?.token.symbol).toBe(
      "KODO",
    );
    expect(await settle(getTokenInvestigation("solana", kodo.token.address.toLowerCase()))).toBeNull();
  });

  it("mengembalikan null untuk token yang tidak ada atau chain yang salah", async () => {
    expect(await settle(getTokenInvestigation("ethereum", "0xdeadbeef"))).toBeNull();
    expect(await settle(getTokenInvestigation("bsc", nebula.token.address))).toBeNull();
  });

  it("melempar error untuk address simulasi gagal", async () => {
    const pending = getTokenInvestigation(MOCK_FAILING_TOKEN.chain, MOCK_FAILING_TOKEN.address);
    const assertion = expect(pending).rejects.toThrow(/tidak bisa dihubungi/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("menyediakan token contoh dan tautan simulasi gagal", async () => {
    const samples = await listSampleTokens();
    expect(samples.map((item) => item.symbol)).toEqual(["NBLA", "KODO", "SUNY"]);
    expect(samples.find((item) => item.symbol === "SUNY")?.riskLevel).toBe("unknown");
    expect(failureDemoPath()).toBe(tokenPath("arbitrum", MOCK_FAILING_TOKEN.address));
  });
});

describe("konsistensi data tiruan", () => {
  it("setiap hash bukti pada temuan ada di daftar bukti", () => {
    for (const item of MOCK_TOKENS) {
      const evidence = new Set(item.evidence.map((entry) => entry.txHash));
      for (const finding of item.risk.findings) {
        for (const hash of finding.evidenceTxHashes) {
          expect(evidence.has(hash), `${item.token.symbol}: ${finding.id}`).toBe(true);
        }
      }
    }
  });

  it("setiap bukti merujuk ke temuan yang ada", () => {
    for (const item of MOCK_TOKENS) {
      const findingIds = new Set(item.risk.findings.map((finding) => finding.id));
      for (const entry of item.evidence) {
        for (const id of entry.relatedFindingIds) {
          expect(findingIds.has(id), `${item.token.symbol}: ${id}`).toBe(true);
        }
      }
    }
  });
});
