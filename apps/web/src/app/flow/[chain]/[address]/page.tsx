import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SaveToCaseButton } from "@/components/case/save-to-case-dialog";
import { CounterpartiesPanel } from "@/components/flow/counterparties-panel";
import { FlowFilterPanel } from "@/components/flow/flow-filter-panel";
import { FlowHeader } from "@/components/flow/flow-header";
import { FlowStats } from "@/components/flow/flow-stats";
import { TracesPanel } from "@/components/flow/traces-panel";
import { TransfersPanel } from "@/components/flow/transfers-panel";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ClassificationLegend } from "@/components/token/classification-legend";
import { flowPath, getAddressFlow, listFlowChains } from "@/lib/api/flows";
import { listTracesForAddress } from "@/lib/api/traces";
import { isChainId } from "@/lib/chains";
import { filterByTime, firstParam, flowEmptyKind, flowFilterHref, resolveTimeFilter } from "@/lib/flow-filter";
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

export default async function FlowPage({ params, searchParams }: PageProps<"/flow/[chain]/[address]">) {
  const [{ chain, address }, query] = await Promise.all([params, searchParams]);
  const flow = await loadFlow(chain, address);
  if (!flow) notFound();

  const filter = resolveTimeFilter(
    { rentang: firstParam(query.rentang), dari: firstParam(query.dari), sampai: firstParam(query.sampai) },
    flow.window,
  );
  const transfers = filterByTime(flow.transfers, filter);
  const totals = summarizeFlow(flow.chain, transfers);
  const resetHref = flowFilterHref(flow.chain, flow.address, {});
  const emptyKind = flowEmptyKind(flow.transfers.length, transfers.length);
  const [traces, chains] = await Promise.all([
    listTracesForAddress(flow.chain, flow.address),
    listFlowChains(flow.chain, flow.address),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <FlowHeader
        flow={flow}
        actions={
          <SaveToCaseButton
            subject={{
              kind: "address",
              chain: flow.chain,
              address: flow.address,
              title: addressTitle(flow.label),
              label: flow.label,
              href: flowPath(flow.chain, flow.address),
            }}
            suggestedTitle={`Aliran dana ${addressTitle(flow.label)}`}
          />
        }
      />
      <FlowFilterPanel
        chain={flow.chain}
        address={flow.address}
        chains={chains}
        window={flow.window}
        filter={filter}
        shownCount={transfers.length}
        totalCount={flow.transfers.length}
      />
      <FlowStats totals={totals} />
      <CounterpartiesPanel
        sources={topCounterparties(flow.chain, transfers, "in")}
        destinations={topCounterparties(flow.chain, transfers, "out")}
        empty={emptyKind ? { kind: emptyKind, totalCount: flow.transfers.length, resetHref } : null}
      />

      {/* grid-cols-1 = minmax(0,1fr): cegah isi lebar mendorong kolom melebihi layar HP. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TransfersPanel
            chain={flow.chain}
            owner={{ address: flow.address, label: flow.label }}
            transfers={sortTransfersNewestFirst(transfers)}
            totalCount={flow.transfers.length}
            resetHref={resetHref}
          />
        </div>
        <aside className="min-w-0 space-y-5" aria-label="Telusur dan keterangan">
          <TracesPanel traces={traces} />
          <ClassificationLegend />
        </aside>
      </div>
    </main>
  );
}
