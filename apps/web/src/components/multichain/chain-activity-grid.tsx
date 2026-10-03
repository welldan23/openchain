import { ChevronRight, CloudOff, Hourglass, Layers } from "lucide-react";
import Link from "next/link";
import { ChainBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import { RefreshButton } from "@/components/ui/refresh-button";
import { flowPath } from "@/lib/api/flows";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatNumber, formatUsdCompact } from "@/lib/format";
import { isActive, sortChainActivity } from "@/lib/multichain";
import type { ChainActivity, ChainId } from "@/lib/types";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ChainCard({ activity, address, hasFlow }: { activity: ChainActivity; address: string; hasFlow: boolean }) {
  const active = isActive(activity);
  if (activity.status === "unavailable") {
    return (
      <article
        aria-label={`Aktivitas di chain ${activity.chain}: data tidak tersedia`}
        className="flex flex-col rounded-lg border border-dashed border-rose-400/40 bg-rose-500/5 p-4"
      >
        <header className="flex items-center justify-between gap-2">
          <ChainBadge chain={activity.chain} />
          <span className="inline-flex items-center gap-1 text-[11px] text-rose-200">
            <CloudOff className="size-3.5" aria-hidden />
            Data tidak tersedia
          </span>
        </header>
        <p className="mt-3 text-xs leading-relaxed text-foreground/80">
          {activity.statusReason ?? "Data jaringan ini gagal dimuat."}
        </p>
        <div className="mt-auto pt-3">
          <RefreshButton />
        </div>
      </article>
    );
  }
  return (
    <article
      aria-label={`Aktivitas di chain ${activity.chain}`}
      className={cn("flex flex-col rounded-lg border p-4", active ? "border-line" : "border-dashed border-line/70")}
    >
      <header className="flex items-center justify-between gap-2">
        <ChainBadge chain={activity.chain} />
        <span className={cn("text-[11px]", active ? "text-foreground/80" : "text-muted")}>
          {active ? `${formatNumber(activity.txCount)} transaksi` : "Belum ada aktivitas"}
        </span>
      </header>
      {activity.status === "stale" ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          <Hourglass className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>
            Data tertinggal{activity.fetchedAt ? ` (diambil ${formatDateTime(activity.fetchedAt)})` : ""}.{" "}
            {activity.statusReason}
          </span>
        </p>
      ) : null}
      {active ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <Metric label="Dana masuk" value={formatUsdCompact(activity.inUsd)} />
            <Metric label="Dana keluar" value={formatUsdCompact(activity.outUsd)} />
            <Metric label="Lawan transaksi" value={formatNumber(activity.counterpartyCount)} />
            <Metric label="Saldo native" value={formatUsdCompact(activity.balanceUsd)} />
          </dl>
          <p className="mt-3 text-[11px] text-muted">
            Aktif {activity.firstSeen ? formatDate(activity.firstSeen) : "–"} – {activity.lastSeen ? formatDate(activity.lastSeen) : "–"}
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Address ini tidak mengirim atau menerima dana di chain ini selama periode data.
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <span className="text-[11px] text-muted">Blok {formatNumber(activity.snapshotBlock)}</span>
        {hasFlow ? (
          <Link
            href={flowPath(activity.chain, address)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/90 transition hover:text-accent"
          >
            Lacak aliran dana
            <ChevronRight className="size-3" aria-hidden />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/** Satu kartu per chain EVM; chain aktif lebih dulu. */
export function ChainActivityGrid({
  address,
  chains,
  flowChains,
}: {
  address: string;
  chains: ChainActivity[];
  /** Chain yang punya halaman aliran dana untuk address ini. */
  flowChains: ChainId[];
}) {
  return (
    <Panel
      id="aktivitas-chain"
      title="Aktivitas per chain"
      description="Address EVM yang sama dipakai di semua chain EVM, jadi aktivitasnya bisa dibandingkan."
      icon={Layers}
      action={<ClassificationBadge classification="fact" />}
    >
      <div className={cn("grid grid-cols-1 gap-3", chains.length > 1 && "sm:grid-cols-2")}>
        {sortChainActivity(chains).map((activity) => (
          <ChainCard
            key={activity.chain}
            activity={activity}
            address={address}
            hasFlow={flowChains.includes(activity.chain)}
          />
        ))}
      </div>
    </Panel>
  );
}
