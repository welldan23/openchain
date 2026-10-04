import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ReportEditor } from "@/components/report/report-editor";
import { getCase } from "@/lib/api/cases";
import { getReport } from "@/lib/api/reports";

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
  // Kasus sumber dipakai pemilih entitas dan temuan; laporan tetap tampil bila kasusnya sudah tidak ada.
  const source = report.source ? await getCase(report.source.caseId) : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <ReportEditor initialReport={report} source={source} nowIso={new Date().toISOString()} />
    </main>
  );
}
