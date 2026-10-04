import { describe, expect, it } from "vitest";
import { MOCK_REPORTS } from "./mock/reports";
import { csvCell, escapeHtml, exportFileName, mdText, reportToCsv, reportToHtml, reportToJson, reportToMarkdown } from "./report-export";
import type { InvestigationReport } from "./types";

const [draft, final] = MOCK_REPORTS;
const AT = new Date("2026-10-04T08:00:00.000Z");

const hostile: InvestigationReport = {
  ...final,
  title: '<script>alert("x")</script> Laporan',
  summary: "=HYPERLINK(\"http://jahat\") & [tautan](javascript:alert(1))",
  sections: [
    {
      id: "s",
      title: "Temuan <b>",
      blocks: [
        {
          kind: "claim",
          id: "c",
          claim: {
            id: "c",
            title: "=SUM(A1) <img src=x onerror=alert(1)>",
            detail: "*tebal* _miring_ `kode`",
            classification: "heuristic",
            provider: "+cmd",
            observedAt: "2026-10-03T00:00:00.000Z",
            evidenceTxHashes: [],
          },
        },
      ],
    },
  ],
};

describe("ekspor laporan", () => {
  it("nama file dari judul dan tanggal ekspor", () => {
    expect(exportFileName(draft, "markdown", AT)).toBe("laporan-dugaan-bundler-di-peluncuran-nbla-20261004.md");
    expect(exportFileName({ title: "Perpindahan dana ke Base" }, "csv", AT)).toBe("laporan-perpindahan-dana-ke-base-20261004.csv");
    expect(exportFileName({ title: "!!!" }, "json", AT)).toBe("laporan-20261004.json");
  });

  it("JSON memuat laporan utuh, status kesiapan, dan waktu ekspor", () => {
    const parsed = JSON.parse(reportToJson(draft, AT));
    expect(parsed).toMatchObject({ format: "openchain.report", version: 1, generatedAt: AT.toISOString(), readiness: { ready: false } });
    expect(parsed.report.id).toBe(draft.id);
    expect(parsed.readiness.issues.length).toBeGreaterThan(0);
    expect(JSON.parse(reportToJson(final, AT)).readiness.ready).toBe(true);
  });

  it("CSV: satu baris per hash klaim, tautan explorer, dan sel berbahaya dinetralkan", () => {
    const csv = reportToCsv(final);
    expect(csv.startsWith("﻿jenis_baris,bagian,judul")).toBe(true);
    const claim = final.sections.flatMap((section) => section.blocks).find((block) => block.kind === "claim")!;
    if (claim.kind !== "claim") throw new Error("bukan klaim");
    for (const hash of claim.claim.evidenceTxHashes) expect(csv).toContain(hash);
    expect(csv).toContain("https://");
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe("");
    expect(reportToCsv(hostile)).toContain("'=SUM(A1)");
    const lines = reportToCsv(draft).split("\r\n");
    expect(lines[1]).toMatch(/^status_laporan,.*DRAF — belum lengkap: 2 hal perlu dilengkapi/);
    expect(lines[2]).toMatch(/^snapshot,/);
    expect(lines.filter((line) => line.startsWith("masalah_kesiapan,")).length).toBeGreaterThan(0);
    expect(csv.split("\r\n")[1]).toMatch(/siap dibagikan/);
  });

  it("Markdown: tanda DRAF untuk laporan belum lengkap, nilai kosong ditulis 'belum ada', teks bebas di-escape", () => {
    const md = reportToMarkdown(draft, AT);
    expect(md).toContain("**DRAF — belum lengkap.**");
    expect(md).toContain("Waktu data: _belum ada_");
    expect(md).toContain("## Snapshot data");
    expect(md).toContain("## Masalah kesiapan");
    expect(reportToMarkdown(final, AT)).not.toContain("DRAF");
    expect(mdText("[tautan](javascript:x) *x*")).toBe("\\[tautan\\](javascript:x) \\*x\\*");
    expect(reportToMarkdown(hostile, AT)).not.toContain("[tautan](javascript");
  });

  it("HTML: dokumen utuh, teks bebas di-escape, tanpa skrip", () => {
    const html = reportToHtml(hostile, AT);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('lang="id"');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    const draftHtml = reportToHtml(draft, AT);
    expect(draftHtml).toContain("DRAF — belum lengkap");
    expect(draftHtml).toContain('rel="noopener noreferrer"');
  });
});
