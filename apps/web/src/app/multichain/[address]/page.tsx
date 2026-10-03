import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MockDataNotice } from "@/components/mock-data-notice";
import { BridgesPanel } from "@/components/multichain/bridges-panel";
import { ChainActivityGrid } from "@/components/multichain/chain-activity-grid";
import { MultichainHeader } from "@/components/multichain/multichain-header";
import { MultichainStats } from "@/components/multichain/multichain-stats";
import { ClassificationLegend } from "@/components/token/classification-legend";
import { listFlowChains } from "@/lib/api/flows";
import { getMultichainProfile } from "@/lib/api/multichain";
import { shortenHash } from "@/lib/format";
import { addressTitle } from "@/lib/fund-flow";
import { summarizeMultichain } from "@/lib/multichain";

/** Dipakai bersama oleh generateMetadata & Page; `cache` mencegah fetch ganda. */
const loadProfile = cache(async (address: string) => getMultichainProfile(address));

export async function generateMetadata({ params }: PageProps<"/multichain/[address]">): Promise<Metadata> {
  const { address } = await params;
  const profile = await loadProfile(address);
  if (!profile) return { title: "Address tidak ditemukan" };
  return {
    title: `Multichain ${profile.label ? addressTitle(profile.label) : shortenHash(profile.address)}`,
    description: "Aktivitas satu address di beberapa chain EVM dan perpindahan dananya lewat bridge.",
  };
}

export default async function MultichainPage({ params }: PageProps<"/multichain/[address]">) {
  const { address } = await params;
  const profile = await loadProfile(address);
  if (!profile) notFound();

  const summary = summarizeMultichain(profile);
  const flowChains = (await listFlowChains("ethereum", profile.address))
    .filter((item) => item.hasData)
    .map((item) => item.chain);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <MultichainHeader profile={profile} summary={summary} />
      <MultichainStats summary={summary} chainCount={profile.chains.length} />

      {/* grid-cols-1 = minmax(0,1fr): cegah isi lebar mendorong kolom melebihi layar HP. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <ChainActivityGrid address={profile.address} chains={profile.chains} flowChains={flowChains} />
          <BridgesPanel bridges={profile.bridges} />
        </div>
        <aside className="min-w-0" aria-label="Keterangan">
          <ClassificationLegend />
        </aside>
      </div>
    </main>
  );
}
