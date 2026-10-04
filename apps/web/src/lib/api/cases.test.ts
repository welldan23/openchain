import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_CASES } from "../mock/cases";
import { caseFailureDemoPath, casePath, getCase, listCases, MOCK_FAILING_SAVE_TEXT, saveToCase } from "./cases";

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

describe("simpan ke kasus (mock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const [nbla] = MOCK_CASES;
  const subject = nbla.subjects[0];

  async function rejects(promise: Promise<unknown>, error: RegExp) {
    const assertion = expect(promise).rejects.toThrow(error);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  }

  it("tidak menggandakan subjek dan temuan yang sudah ada di kasus", async () => {
    const fresh = { id: "baru", title: "Temuan baru", detail: "", classification: "fact" as const, evidenceTxHashes: ["0x1"] };
    const result = await settle(
      saveToCase({ target: { kind: "existing", caseId: nbla.id }, subject, findings: [nbla.findings[0], fresh], note: " cek " }),
    );
    expect(result).toEqual({
      caseId: nbla.id,
      caseTitle: nbla.title,
      created: false,
      subjectAdded: false,
      addedFindings: 1,
      skippedFindings: 1,
      noteAdded: true,
    });
  });

  it("membuat kasus baru dengan judul yang dirapikan", async () => {
    const result = await settle(saveToCase({ target: { kind: "new", title: "  Kasus   NBLA  " }, subject, findings: [] }));
    expect(result).toMatchObject({ caseTitle: "Kasus NBLA", created: true, subjectAdded: true, addedFindings: 0, noteAdded: false });
    expect(result.caseId).toBe("baru-kasus-nbla");
  });

  it("menolak judul pendek, temuan tanpa bukti, kasus tak dikenal, dan simulasi gagal", async () => {
    await rejects(saveToCase({ target: { kind: "new", title: "ab" }, subject, findings: [] }), /minimal 3/);
    await rejects(
      saveToCase({
        target: { kind: "new", title: "Kasus" },
        subject,
        findings: [{ id: "x", title: "x", detail: "", classification: "assumption", evidenceTxHashes: [] }],
      }),
      /tanpa hash bukti/,
    );
    await rejects(saveToCase({ target: { kind: "existing", caseId: "tidak-ada" }, subject, findings: [] }), /tidak ditemukan/);
    await rejects(saveToCase({ target: { kind: "new", title: `Kasus ${MOCK_FAILING_SAVE_TEXT}` }, subject, findings: [] }), /Simulasi/);
  });
});
