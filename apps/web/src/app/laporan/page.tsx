import type { Metadata } from "next";
import { connection } from "next/server";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ReportList } from "@/components/report/report-list";
import { listReports } from "@/lib/api/reports";

export const metadata: Metadata = {
  title: "Laporan investigasi",
  description: "Laporan berbasis bukti yang disusun dari kasus: klaim, bukti transaksi, catatan, dan snapshot datanya.",
};

export default async function ReportsPage() {
  // "Diperbarui x jam lalu" bergantung jam sekarang, jadi dirender per permintaan.
  await connection();
  const reports = await listReports();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Laporan investigasi</h1>
        <p className="mt-1 text-sm text-muted">
          Laporan berbasis bukti yang disusun dari kasus. Setiap klaim menyebut provider, waktu data, dan hash transaksinya.
        </p>
      </div>
      <ReportList reports={reports} now={new Date()} />
    </main>
  );
}
