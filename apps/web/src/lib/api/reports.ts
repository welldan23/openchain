/**
 * Laporan investigasi.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak: `GET /reports`
 * → `ReportSummary[]` dan `GET /reports/:id` → `InvestigationReport`, 404
 * bila tidak ada) tanpa mengubah komponen yang memakainya.
 */
import { MOCK_FAILING_REPORT_ID, MOCK_REPORTS } from "../mock/reports";
import { reportIssues, reportStats } from "../report";
import type { InvestigationReport, ReportSummary } from "../types";

const MOCK_LATENCY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Semua laporan, terbaru diperbarui di atas. */
export async function listReports(): Promise<ReportSummary[]> {
  await delay(MOCK_LATENCY_MS);
  return MOCK_REPORTS.map((report) => {
    const stats = reportStats(report);
    return {
      id: report.id,
      title: report.title,
      summary: report.summary,
      status: report.status,
      updatedAt: report.updatedAt,
      sourceTitle: report.source?.title ?? null,
      sectionCount: stats.sectionCount,
      claimCount: stats.claimCount,
      evidenceCount: stats.evidenceCount,
      blockerCount: reportIssues(report).filter((issue) => issue.level === "blocker").length,
    };
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Satu laporan lengkap; `null` bila tidak ada. */
export async function getReport(id: string): Promise<InvestigationReport | null> {
  await delay(MOCK_LATENCY_MS);
  if (id === MOCK_FAILING_REPORT_ID) throw new Error("Simulasi: layanan laporan tidak bisa dihubungi.");
  return MOCK_REPORTS.find((report) => report.id === id) ?? null;
}

export function reportPath(id: string): `/laporan/${string}` {
  return `/laporan/${encodeURIComponent(id)}`;
}

export function reportFailureDemoPath(): `/laporan/${string}` {
  return reportPath(MOCK_FAILING_REPORT_ID);
}
