import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ActivityPanel } from "@/components/token/activity-panel";
import { ClassificationLegend } from "@/components/token/classification-legend";
import { EvidencePanel } from "@/components/token/evidence-panel";
import { HoldersPanel } from "@/components/token/holders-panel";
import { RiskPanel } from "@/components/token/risk-panel";
import { TokenSummary } from "@/components/token/token-summary";
import { getTokenInvestigation } from "@/lib/api/tokens";
import { isChainId } from "@/lib/chains";

/** Dipakai bersama oleh generateMetadata & Page; `cache` mencegah fetch ganda. */
const loadToken = cache(async (chain: string, address: string) => {
  if (!isChainId(chain)) return null;
  return getTokenInvestigation(chain, address);
});

export async function generateMetadata({
  params,
}: PageProps<"/token/[chain]/[address]">): Promise<Metadata> {
  const { chain, address } = await params;
  const data = await loadToken(chain, address);
  if (!data) return { title: "Token tidak ditemukan" };
  return {
    title: `${data.token.name} (${data.token.symbol})`,
    description: `Investigasi token ${data.token.name}: risiko, pemegang, aktivitas, dan bukti transaksi.`,
  };
}

export default async function TokenPage({ params }: PageProps<"/token/[chain]/[address]">) {
  const { chain, address } = await params;
  const data = await loadToken(chain, address);
  if (!data) notFound();

  const { token, risk, holders, activity, evidence } = data;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <TokenSummary data={data} />

      {/* grid-cols-1 = minmax(0,1fr): cegah tabel lebar mendorong kolom melebihi layar HP. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <RiskPanel chain={token.chain} risk={risk} />
          <HoldersPanel
            chain={token.chain}
            symbol={token.symbol}
            concentration={holders.concentration}
            holders={holders.top}
          />
          <ActivityPanel chain={token.chain} symbol={token.symbol} activity={activity} />
        </div>
        <aside className="min-w-0 space-y-5" aria-label="Bukti dan keterangan">
          <EvidencePanel chain={token.chain} evidence={evidence} findings={risk.findings} />
          <ClassificationLegend />
        </aside>
      </div>
    </main>
  );
}
