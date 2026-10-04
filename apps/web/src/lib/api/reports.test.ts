import { describe, expect, it } from "vitest";
import { MOCK_FAILING_REPORT_ID, MOCK_REPORTS } from "../mock/reports";
import { getReport, listReports, reportFailureDemoPath, reportPath } from "./reports";

describe("API tiruan laporan", () => {
  it("daftar terbaru dulu, dengan jumlah penghalang", async () => {
    const list = await listReports();
    expect(list.map((item) => item.id)).toEqual(["laporan-bundler-nbla", "laporan-pendana-ke-base"]);
    expect(list[0].blockerCount).toBeGreaterThan(0);
    expect(list[1].blockerCount).toBe(0);
  });

  it("mengambil satu laporan; yang tidak ada `null`; simulasi gagal melempar error", async () => {
    expect(await getReport(MOCK_REPORTS[0].id)).toBe(MOCK_REPORTS[0]);
    expect(await getReport("tidak-ada")).toBeNull();
    await expect(getReport(MOCK_FAILING_REPORT_ID)).rejects.toThrow("Simulasi");
    expect(reportFailureDemoPath()).toBe(reportPath(MOCK_FAILING_REPORT_ID));
  });
});
