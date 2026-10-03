import { ClassificationBadge } from "@/components/classification-badge";
import { cn } from "@/lib/cn";
import { formatNumber, formatUsdCompact } from "@/lib/format";
import type { FlowTotals } from "@/lib/fund-flow";

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}

function Stat({ label, value, sub, valueClassName }: StatProps) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("mt-1 truncate text-lg font-semibold tracking-tight", valueClassName)}>{value}</dd>
      {sub ? <dd className="mt-0.5 truncate text-xs text-muted">{sub}</dd> : null}
    </div>
  );
}

function signedUsd(value: number): string {
  return `${value > 0 ? "+" : ""}${formatUsdCompact(value)}`;
}

/** Angka ringkas aliran dana; nilai USD dihitung dari transfer yang harganya diketahui. */
export function FlowStats({ totals }: { totals: FlowTotals }) {
  const transferCount = totals.inCount + totals.outCount;
  let pricedNote = "Semua ada harganya";
  if (transferCount === 0) pricedNote = "Belum ada transfer";
  else if (totals.unpricedCount > 0) pricedNote = `${totals.unpricedCount} tanpa harga`;
  return (
    <section aria-label="Ringkasan aliran dana" className="space-y-2">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Dana masuk" value={formatUsdCompact(totals.inUsd)} sub={`${totals.inCount} transfer`} />
        <Stat label="Dana keluar" value={formatUsdCompact(totals.outUsd)} sub={`${totals.outCount} transfer`} />
        <Stat
          label="Selisih"
          value={signedUsd(totals.netUsd)}
          sub={totals.netUsd > 0 ? "Lebih banyak masuk" : totals.netUsd < 0 ? "Lebih banyak keluar" : "Seimbang"}
          valueClassName={totals.netUsd > 0 ? "text-emerald-400" : totals.netUsd < 0 ? "text-orange-400" : undefined}
        />
        <Stat label="Lawan transaksi" value={formatNumber(totals.counterpartyCount)} sub="Address unik" />
        <Stat
          label="Total transfer"
          value={formatNumber(transferCount)}
          sub={pricedNote}
        />
      </dl>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <ClassificationBadge classification="calculation" />
        <span>
          Dijumlahkan dari transfer pada snapshot, memakai nilai USD saat transaksi.
          {totals.unpricedCount > 0
            ? ` ${totals.unpricedCount} transfer memakai aset yang harganya tidak diketahui, jadi tidak ikut dijumlahkan. Jumlah tokennya tetap tercatat di daftar transfer.`
            : null}
        </span>
      </div>
    </section>
  );
}
