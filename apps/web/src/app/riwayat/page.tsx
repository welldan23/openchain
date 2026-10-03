import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { InvestigationTimeline } from "@/components/history/investigation-timeline";
import { MockDataNotice } from "@/components/mock-data-notice";
import { listInvestigationHistory } from "@/lib/api/search";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Riwayat investigasi",
  description: "Investigasi yang pernah dibuka, per hari, lengkap dengan jam dan catatan.",
};

export default async function HistoryPage() {
  // Riwayat berubah tiap kali dibuka dan label "Hari ini" bergantung jam sekarang, jadi jangan dirender saat build.
  await connection();
  const entries = await listInvestigationHistory();
  const withNotes = entries.filter((entry) => entry.note).length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Riwayat investigasi</h1>
          <p className="mt-1 text-sm text-muted">
            {formatNumber(entries.length)} investigasi · {formatNumber(withNotes)} dengan catatan. Jam dalam WIB.
          </p>
        </div>
        <Link
          href="/cari"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Search className="size-3.5" aria-hidden />
          Cari investigasi baru
        </Link>
      </div>
      <p className="text-[11px] text-muted">
        Catatan di data tiruan belum tersimpan permanen dan kembali seperti semula saat halaman dimuat ulang. Isi
        catatan dengan “#gagal” untuk mencoba tampilan saat penyimpanan gagal.
      </p>
      <InvestigationTimeline entries={entries} now={new Date().toISOString()} />
    </main>
  );
}
