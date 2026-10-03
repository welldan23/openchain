import { ChevronRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { ChainBadge, RiskLevelBadge } from "@/components/badges";
import { failureDemoPath, listSampleTokens, tokenPath } from "@/lib/api/tokens";
import { shortenHash } from "@/lib/format";

export default async function Home() {
  const samples = await listSampleTokens();

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

      <section aria-labelledby="sample-title" className="mt-10">
        <h2 id="sample-title" className="text-sm font-semibold">
          Coba buka token contoh
        </h2>
        <p className="mt-1 text-xs text-muted">
          Data masih tiruan. Token di bawah ini fiktif dan dipakai untuk mencoba tampilan.
        </p>
        <ul className="mt-4 space-y-3">
          {samples.map((token) => (
            <li key={`${token.chain}:${token.address}`}>
              <Link
                href={tokenPath(token.chain, token.address)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-teal-400/80 to-indigo-500/80 text-xs font-bold text-white"
                >
                  {token.symbol.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{token.name}</span>
                    <span className="text-xs text-muted">{token.symbol}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ChainBadge chain={token.chain} />
                    <RiskLevelBadge level={token.riskLevel} />
                    <span className="font-mono text-[11px] text-muted">
                      {shortenHash(token.address)}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="states-title" className="mt-10">
        <h2 id="states-title" className="text-sm font-semibold">
          Coba tampilan status
        </h2>
        <p className="mt-1 text-xs text-muted">
          Sunyi Protocol di atas memperlihatkan tampilan saat data token belum ada. Halaman token juga
          menampilkan kerangka loading sebentar sebelum datanya muncul.
        </p>
        <Link
          href={failureDemoPath()}
          className="group mt-4 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi data gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka token yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
      </section>
    </main>
  );
}
