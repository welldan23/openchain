import { ChevronRight, FileText, FolderOpen, Search } from "lucide-react";
import Link from "next/link";
import { LiveStart } from "@/components/home/live-start";
import { MockSamples } from "@/components/home/mock-samples";
import { isLive } from "@/lib/api/http";

export default async function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-accent">
        Workspace investigasi on-chain
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Ubah data blockchain mentah jadi temuan yang bisa ditelusuri dan dibuktikan.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
        Multichain wallet tracing, token due diligence, fund-flow analysis, risk intelligence, and
        evidence-backed reporting.
      </p>

      <Link
        href="/cari"
        className="group mt-8 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted transition hover:border-accent/50 hover:text-foreground"
      >
        <Search className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Cari address, hash transaksi, atau nama token…</span>
        <span className="hidden text-xs sm:inline">Riwayat investigasi</span>
        <ChevronRight className="size-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </Link>
      <Link
        href="/kasus"
        className="group mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-accent/50"
      >
        <FolderOpen className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Kasus investigasi tersimpan</span>
          <span className="mt-0.5 block text-xs text-muted">Temuan, bukti transaksi, catatan, dan snapshot data per kasus.</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </Link>

      <Link
        href="/laporan"
        className="group mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-accent/50"
      >
        <FileText className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Laporan investigasi</span>
          <span className="mt-0.5 block text-xs text-muted">Klaim berbukti dengan provider, waktu data, dan hash transaksi; siap dibagikan.</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </Link>

      {isLive() ? <LiveStart /> : <MockSamples />}
    </main>
  );
}
