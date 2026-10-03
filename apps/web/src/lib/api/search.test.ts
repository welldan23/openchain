import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_FLOWS } from "../mock/flows";
import { MOCK_FAILING_QUERY } from "../mock/search";
import { MOCK_TOKENS } from "../mock/tokens";
import { listInvestigationHistory, searchInvestigations, searchPath, suggestSearch } from "./search";

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5_000);
  return promise;
}

describe("API pencarian (mock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("mencari token dari nama atau simbol, tanpa peduli huruf besar/kecil", async () => {
    const response = await settle(searchInvestigations("nbla"));
    expect(response.kind).toBe("text");
    expect(response.results[0]).toMatchObject({ kind: "token", title: "Nebula Finance", matchedBy: 'Nama persis "NBLA"' });
  });

  it("mencari wallet dari nama labelnya", async () => {
    const response = await settle(searchInvestigations("pendana"));
    expect(response.results.map((item) => item.kind)).toEqual(["address", "address", "address"]);
    expect(new Set(response.results.map((item) => item.href.split("/")[1]))).toEqual(new Set(["flow", "multichain"]));
  });

  it("address EVM persis membuka semua halaman yang memuatnya", async () => {
    const funder = MOCK_FLOWS[0];
    const response = await settle(searchInvestigations(funder.address.toUpperCase().replace("0X", "0x")));
    expect(response.kind).toBe("evm_address");
    expect(response.results.map((item) => item.href)).toEqual([
      `/flow/ethereum/${funder.address}`,
      `/flow/base/${funder.address}`,
      `/multichain/${funder.address}`,
    ]);
  });

  it("hash transaksi membuka aliran dana dengan modal buktinya", async () => {
    const transfer = MOCK_FLOWS[0].transfers[0];
    const response = await settle(searchInvestigations(transfer.txHash));
    expect(response.kind).toBe("evm_tx");
    expect(response.results[0].href).toBe(`/flow/ethereum/${MOCK_FLOWS[0].address}#bukti-${transfer.txHash}`);
  });

  it("address Solana harus persis, teks terlalu pendek tidak dicari", async () => {
    const kodo = MOCK_TOKENS.find((item) => item.token.chain === "solana")!;
    expect((await settle(searchInvestigations(kodo.token.address))).results).toHaveLength(1);
    expect((await settle(searchInvestigations(kodo.token.address.toLowerCase()))).results).toHaveLength(0);
    expect((await settle(searchInvestigations("n"))).results).toEqual([]);
    expect((await settle(searchInvestigations(""))).kind).toBe("empty");
  });

  it("melempar error untuk isian simulasi gagal", async () => {
    const pending = searchInvestigations(MOCK_FAILING_QUERY);
    const assertion = expect(pending).rejects.toThrow(/tidak bisa dihubungi/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("saran memotong hasil tapi tetap melaporkan jumlah semuanya", async () => {
    const address = MOCK_FLOWS[0].address;
    const full = await settle(searchInvestigations(address));
    const suggestions = await settle(suggestSearch(address, 2));
    expect(full.results.length).toBeGreaterThan(2);
    expect(suggestions.results).toEqual(full.results.slice(0, 2));
    expect(suggestions.total).toBe(full.results.length);
    const failing = suggestSearch(MOCK_FAILING_QUERY);
    const assertion = expect(failing).rejects.toThrow(/tidak bisa dihubungi/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("riwayat terbaru dulu dan semua tautannya menuju halaman yang ada", async () => {
    const history = await listInvestigationHistory();
    expect(history.map((item) => item.id)).toEqual(["hist-1", "hist-2", "hist-3", "hist-4", "hist-5", "hist-6"]);
    expect(history.every((item) => /^\/(token|flow|trace|map|multichain)\//.test(item.href))).toBe(true);
    expect(searchPath(" nbla ")).toBe("/cari?q=nbla");
    expect(searchPath("")).toBe("/cari");
  });
});
