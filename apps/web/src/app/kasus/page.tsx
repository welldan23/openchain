import type { Metadata } from "next";
import { connection } from "next/server";
import { CaseList } from "@/components/case/case-list";
import { CaseStatusFilterTabs } from "@/components/case/case-status-filter";
import { MockDataNotice } from "@/components/mock-data-notice";
import { listCases } from "@/lib/api/cases";
import { caseStatusCounts, filterCases, parseCaseStatusFilter } from "@/lib/cases";
import { firstParam } from "@/lib/flow-filter";

export const metadata: Metadata = {
  title: "Kasus investigasi",
  description: "Investigasi yang disimpan beserta temuan, bukti transaksi, catatan, dan snapshot datanya.",
};

export default async function CasesPage({ searchParams }: PageProps<"/kasus">) {
  // "Diperbarui x jam lalu" bergantung jam sekarang, jadi dirender per permintaan.
  await connection();
  const filter = parseCaseStatusFilter(firstParam((await searchParams).tahap));
  const cases = await listCases();
  const shown = filterCases(cases, filter);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Kasus investigasi</h1>
        <p className="mt-1 text-sm text-muted">
          Investigasi yang disimpan, lengkap dengan temuan, bukti transaksi, catatan, dan snapshot data supaya bisa
          dibuka ulang dengan hasil yang sama.
        </p>
      </div>
      <CaseStatusFilterTabs current={filter} counts={caseStatusCounts(cases)} />
      <CaseList cases={shown} now={new Date()} filtered={filter !== "all"} />
    </main>
  );
}
