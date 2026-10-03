import { ClassificationBadge } from "@/components/classification-badge";
import { getChain } from "@/lib/chains";
import { formatNumber, formatUsdCompact } from "@/lib/format";
import type { MultichainSummary } from "@/lib/multichain";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</dd>
      {sub ? <dd className="mt-0.5 truncate text-xs text-muted">{sub}</dd> : null}
    </div>
  );
}

export function MultichainStats({ summary, chainCount }: { summary: MultichainSummary; chainCount: number }) {
  return (
    <section aria-label="Ringkasan lintas chain" className="space-y-2">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Chain aktif" value={`${summary.activeChains.length} / ${chainCount}`} sub={summary.busiestChain ? `Tersibuk: ${getChain(summary.busiestChain).name}` : "Belum aktif"} />
        <Stat label="Total transaksi" value={formatNumber(summary.totalTx)} sub="Semua chain" />
        <Stat label="Dana masuk" value={formatUsdCompact(summary.inUsd)} />
        <Stat label="Dana keluar" value={formatUsdCompact(summary.outUsd)} />
        <Stat label="Saldo native" value={formatUsdCompact(summary.balanceUsd)} sub="Pada snapshot" />
        <Stat
          label="Lewat bridge"
          value={formatUsdCompact(summary.bridgedUsd)}
          sub={summary.bridgeCount === 0 ? "Tidak ada" : summary.unmatchedBridges > 0 ? `${summary.bridgeCount} kiriman · ${summary.unmatchedBridges} belum cocok` : `${summary.bridgeCount} kiriman, semua cocok`}
        />
      </dl>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <ClassificationBadge classification="calculation" />
        <span>Dijumlahkan dari transaksi tiap chain pada snapshot, memakai nilai USD saat transaksi.</span>
      </div>
    </section>
  );
}
