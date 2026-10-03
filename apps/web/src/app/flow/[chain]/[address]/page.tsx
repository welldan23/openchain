import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CounterpartiesPanel } from "@/components/flow/counterparties-panel";
import { FlowHeader } from "@/components/flow/flow-header";
import { FlowStats } from "@/components/flow/flow-stats";
import { TracesPanel } from "@/components/flow/traces-panel";
import { TransfersPanel } from "@/components/flow/transfers-panel";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ClassificationLegend } from "@/components/token/classification-legend";
import { getAddressFlow } from "@/lib/api/flows";
import { listTracesForAddress } from "@/lib/api/traces";
import { isChainId } from "@/lib/chains";
import { shortenHash } from "@/lib/format";
import { addressTitle, sortTransfersNewestFirst, summarizeFlow, topCounterparties } from "@/lib/fund-flow";

/** Dipakai bersama oleh generateMetadata & Page; `cache` mencegah fetch ganda. */
const loadFlow = cache(async (chain: string, address: string) => {
  if (!isChainId(chain)) return null;
  return getAddressFlow(chain, address);
});

export async function generateMetadata({
  params,
}: PageProps<"/flow/[chain]/[address]">): Promise<Metadata> {
  const { chain, address } = await params;
  const flow = await loadFlow(chain, address);
  if (!flow) return { title: "Address tidak ditemukan" };
  return {
    title: `Aliran dana ${flow.label ? addressTitle(flow.label) : shortenHash(flow.address)}`,
    description: `Dari mana dana ${shortenHash(flow.address)} berasal, ke mana bergerak, dan bukti transaksinya.`,
  };
}

export default async function FlowPage({ params }: PageProps<"/flow/[chain]/[address]">) {
  const { chain, address } = await params;
  const flow = await loadFlow(chain, address);
  if (!flow) notFound();

  const totals = summarizeFlow(flow.chain, flow.transfers);
  const traces = await listTracesForAddress(flow.chain, flow.address);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <FlowHeader flow={flow} />
      <FlowStats totals={totals} />
      <CounterpartiesPanel
        sources={topCounterparties(flow.chain, flow.transfers, "in")}
        destinations={topCounterparties(flow.chain, flow.transfers, "out")}
      />

      {/* grid-cols-1 = minmax(0,1fr): cegah isi lebar mendorong kolom melebihi layar HP. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TransfersPanel chain={flow.chain} transfers={sortTransfersNewestFirst(flow.transfers)} />
        </div>
        <aside className="min-w-0 space-y-5" aria-label="Telusur dan keterangan">
          <TracesPanel traces={traces} />
          <ClassificationLegend />
        </aside>
      </div>
    </main>
  );
}
