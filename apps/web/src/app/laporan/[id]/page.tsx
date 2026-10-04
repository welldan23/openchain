import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { EvidenceProvider } from "@/components/evidence/evidence-dialog";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ReportDocument, ReportHeader, ReportOutline, ReportReadinessPanel, ReportSnapshotPanel } from "@/components/report/report-workspace";
import { getReport } from "@/lib/api/reports";
import { reportIssues } from "@/lib/report";

/** Dipakai bersama oleh generateMetadata & Page; `cache` mencegah fetch ganda. */
const loadReport = cache(async (id: string) => getReport(decodeURIComponent(id)));

export async function generateMetadata({ params }: PageProps<"/laporan/[id]">): Promise<Metadata> {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) return { title: "Laporan tidak ditemukan" };
  return { title: report.title, description: report.summary };
}

export default async function ReportPage({ params }: PageProps<"/laporan/[id]">) {
  await connection();
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) notFound();
  const issues = reportIssues(report);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <ReportHeader report={report} issues={issues} now={new Date()} />
      <EvidenceProvider evidence={report.evidence}>
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[14rem_minmax(0,1fr)_20rem]">
          <ReportOutline report={report} issues={issues} />
          <div className="min-w-0">
            <ReportDocument report={report} issues={issues} />
          </div>
          <div className="min-w-0 space-y-5">
            <ReportReadinessPanel issues={issues} />
            <ReportSnapshotPanel report={report} />
          </div>
        </div>
      </EvidenceProvider>
    </main>
  );
}
