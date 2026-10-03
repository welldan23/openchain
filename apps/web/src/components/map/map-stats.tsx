import { ClassificationBadge } from "@/components/classification-badge";
import { formatNumber, formatPct } from "@/lib/format";
import type { MapSummary } from "@/lib/wallet-map";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</dd>
      {sub ? <dd className="mt-0.5 truncate text-xs text-muted">{sub}</dd> : null}
    </div>
  );
}

export function MapStats({ summary }: { summary: MapSummary }) {
  return (
    <section aria-label="Ringkasan peta" className="space-y-2">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wallet di peta" value={formatNumber(summary.walletCount)} sub={`${summary.holderCount} holder`} />
        <Stat label="Klaster" value={formatNumber(summary.clusterCount)} sub="Kelompok diduga terkait" />
        <Stat label="Supply di klaster" value={formatPct(summary.clusteredSharePct)} sub="Total porsi anggota klaster" />
        <Stat label="Hubungan" value={formatNumber(summary.linkCount)} sub="Transfer antar wallet" />
      </dl>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <ClassificationBadge classification="calculation" />
        <span>Dihitung dari wallet dan transfer yang tampil di peta pada snapshot.</span>
      </div>
    </section>
  );
}
