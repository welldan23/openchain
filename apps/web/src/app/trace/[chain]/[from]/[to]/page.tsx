import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ClassificationLegend } from "@/components/token/classification-legend";
import { TraceHeader } from "@/components/trace/trace-header";
import { TraceStepsPanel } from "@/components/trace/trace-steps-panel";
import { getWalletTrace } from "@/lib/api/traces";
import { isChainId } from "@/lib/chains";
import { addressTitle } from "@/lib/fund-flow";
import { summarizeTrace } from "@/lib/wallet-trace";

/** Dipakai bersama oleh generateMetadata & Page; `cache` mencegah fetch ganda. */
const loadTrace = cache(async (chain: string, from: string, to: string) => {
  if (!isChainId(chain)) return null;
  return getWalletTrace(chain, from, to);
});

export async function generateMetadata({
  params,
}: PageProps<"/trace/[chain]/[from]/[to]">): Promise<Metadata> {
  const { chain, from, to } = await params;
  const trace = await loadTrace(chain, from, to);
  if (!trace) return { title: "Jalur tidak ditemukan" };
  return {
    title: `Telusur ${addressTitle(trace.fromLabel)} → ${addressTitle(trace.toLabel)}`,
    description: "Jejak langkah dana antar wallet beserta hash transaksi tiap langkah.",
  };
}

export default async function TracePage({ params }: PageProps<"/trace/[chain]/[from]/[to]">) {
  const { chain, from, to } = await params;
  const trace = await loadTrace(chain, from, to);
  if (!trace) notFound();

  const summary = summarizeTrace(trace);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <TraceHeader trace={trace} summary={summary} />

      {/* grid-cols-1 = minmax(0,1fr): cegah isi lebar mendorong kolom melebihi layar HP. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TraceStepsPanel trace={trace} summary={summary} />
        </div>
        <aside className="min-w-0" aria-label="Keterangan">
          <ClassificationLegend />
        </aside>
      </div>
    </main>
  );
}
