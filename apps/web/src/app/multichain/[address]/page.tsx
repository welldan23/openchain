import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MockDataNotice } from "@/components/mock-data-notice";
import { BridgesPanel } from "@/components/multichain/bridges-panel";
import { ChainActivityGrid } from "@/components/multichain/chain-activity-grid";
import { ChainComparisonTable } from "@/components/multichain/chain-comparison-table";
import { CrossChainActivityPanel } from "@/components/multichain/cross-chain-activity-panel";
import { DataStatusBanner } from "@/components/multichain/data-status-banner";
import { InfrastructurePanel } from "@/components/multichain/infrastructure-panel";
import { MultichainChainPicker } from "@/components/multichain/chain-picker";
import { MultichainHeader } from "@/components/multichain/multichain-header";
import { MultichainStats } from "@/components/multichain/multichain-stats";
import { ClassificationLegend } from "@/components/token/classification-legend";
import { listFlowChains } from "@/lib/api/flows";
import { getMultichainProfile } from "@/lib/api/multichain";
import { firstParam } from "@/lib/flow-filter";
import { formatNumber, shortenHash } from "@/lib/format";
import { addressTitle } from "@/lib/fund-flow";
import {
  comparisonRows,
  detectInfrastructure,
  filterProfileChains,
  isActive,
  parseChainSelection,
  summarizeMultichain,
} from "@/lib/multichain";

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

export default async function MultichainPage({ params, searchParams }: PageProps<"/multichain/[address]">) {
  const [{ address }, query] = await Promise.all([params, searchParams]);
  const fullProfile = await loadProfile(address);
  if (!fullProfile) notFound();

  const available = fullProfile.chains.map((item) => item.chain);
  const selected = parseChainSelection(firstParam(query.jaringan), available);
  const profile = filterProfileChains(fullProfile, selected);
  const summary = summarizeMultichain(profile);
  const flowChains = (await listFlowChains("ethereum", profile.address))
    .filter((item) => item.hasData)
    .map((item) => item.chain);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <MultichainHeader profile={fullProfile} summary={summarizeMultichain(fullProfile)} />
      <div className="flex flex-wrap items-center gap-3">
        <MultichainChainPicker
          selected={selected}
          options={fullProfile.chains.map((item) => ({
            chain: item.chain,
            detail:
              item.status === "unavailable"
                ? "tidak tersedia"
                : isActive(item)
                  ? `${formatNumber(item.txCount)} transaksi${item.status === "stale" ? " · tertinggal" : ""}`
                  : "tidak aktif",
            muted: !isActive(item),
          }))}
        />
        {selected.length < available.length ? (
          <p className="text-[11px] text-muted">
            Ringkasan, kartu, dan bridge di bawah hanya untuk {selected.length} jaringan terpilih.
          </p>
        ) : null}
      </div>
      <DataStatusBanner unavailable={summary.unavailableChains} stale={summary.staleChains} />
      <MultichainStats summary={summary} chainCount={profile.chains.length} />

      {/* grid-cols-1 = minmax(0,1fr): cegah isi lebar mendorong kolom melebihi layar HP. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {profile.chains.length > 1 ? <ChainComparisonTable rows={comparisonRows(profile)} /> : null}
          <ChainActivityGrid address={profile.address} chains={profile.chains} flowChains={flowChains} />
          <BridgesPanel bridges={profile.bridges} snapshotAt={profile.fetchedAt} />
          <CrossChainActivityPanel owner={{ address: profile.address, label: profile.label }} activities={profile.activities} />
        </div>
        <aside className="min-w-0 space-y-5" aria-label="Infrastruktur dan keterangan">
          <InfrastructurePanel items={detectInfrastructure(profile.activities)} />
          <ClassificationLegend />
        </aside>
      </div>
    </main>
  );
}
