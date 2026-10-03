"use client";

import { ArrowDownLeft, ArrowUpRight, ChevronDown, History, Spline } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceProvider, EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { Badge } from "@/components/ui/badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerAddressUrl } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { evidenceFromCrossChain } from "@/lib/evidence";
import { formatDate, formatDateTime, formatTokenAmount, formatUsdCompact } from "@/lib/format";
import { CROSS_CHAIN_KIND_META } from "@/lib/labels";
import { groupActivitiesByDay, matchesActivityFilter, type ActivityFilter } from "@/lib/multichain";
import type { CrossChainActivity, CrossChainActivityKind, EntityLabel } from "@/lib/types";

const PAGE_SIZE = 10;

const TABS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "Semua" },
  { id: "in", label: "Masuk" },
  { id: "out", label: "Keluar" },
  { id: "bridge", label: "Bridge" },
];

const KIND_ICONS: Record<CrossChainActivityKind, LucideIcon> = {
  in: ArrowDownLeft,
  out: ArrowUpRight,
  bridge_out: Spline,
  bridge_in: Spline,
};

function ActivityRow({ activity }: { activity: CrossChainActivity }) {
  const meta = CROSS_CHAIN_KIND_META[activity.kind];
  const Icon = KIND_ICONS[activity.kind];
  const incoming = activity.kind === "in" || activity.kind === "bridge_in";
  return (
    <li className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4">
      <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-start sm:gap-1">
        <ChainBadge chain={activity.chain} />
        <Badge className={meta.className}>
          <Icon className="size-3" aria-hidden />
          {meta.label}
        </Badge>
        <time dateTime={activity.timestamp} className="text-[11px] text-muted">
          {formatDateTime(activity.timestamp).split(", ")[1] ?? formatDateTime(activity.timestamp)}
        </time>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{incoming ? "Dari" : "Ke"}</span>
        <HashLink
          value={activity.counterparty}
          href={explorerAddressUrl(activity.chain, activity.counterparty)}
          copyLabel="Salin address lawan transaksi"
        />
        {activity.counterpartyLabel ? <EntityLabelBadge label={activity.counterpartyLabel} /> : null}
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
        <span className="text-xs font-medium tabular-nums">
          {formatTokenAmount(activity.amount, activity.asset.symbol)}
          <span className="font-normal text-muted">
            {" "}
            · {activity.amountUsd !== undefined ? formatUsdCompact(activity.amountUsd) : "harga tidak diketahui"}
          </span>
        </span>
        <EvidenceTrigger txHash={activity.txHash} />
      </div>
    </li>
  );
}

/**
 * Linimasa gabungan semua chain terpilih, dikelompokkan per hari (WIB).
 * Hash membuka modal bukti yang memakai explorer chain masing-masing.
 */
export function CrossChainActivityPanel({
  owner,
  activities,
}: {
  owner: { address: string; label?: EntityLabel };
  activities: CrossChainActivity[];
}) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const evidence = useMemo(() => evidenceFromCrossChain(owner, activities), [owner, activities]);
  const filtered = activities.filter((activity) => matchesActivityFilter(activity, filter));
  // Potong per aktivitas (urut terbaru), lalu kelompokkan lagi per hari.
  const newestFirst = groupActivitiesByDay(filtered).flatMap((group) => group.items);
  const shownGroups = groupActivitiesByDay(newestFirst.slice(0, visible));

  return (
    <EvidenceProvider evidence={evidence}>
      <Panel
        id="aktivitas-lintas-chain"
        title="Aktivitas lintas chain"
        description="Semua transfer di jaringan terpilih dalam satu linimasa, dikelompokkan per hari (WIB)."
        icon={History}
        action={<ClassificationBadge classification="fact" />}
      >
        {activities.length === 0 ? (
          <EmptyState
            icon={History}
            title="Belum ada aktivitas"
            description="Address ini tidak mengirim atau menerima dana di jaringan terpilih selama periode data."
          />
        ) : (
          <div className="space-y-4">
            <div role="group" aria-label="Pilih jenis aktivitas" className="inline-flex rounded-lg border border-line bg-surface-raised p-0.5">
              {TABS.map((tab) => {
                const count = activities.filter((activity) => matchesActivityFilter(activity, tab.id)).length;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={filter === tab.id}
                    onClick={() => {
                      setFilter(tab.id);
                      setVisible(PAGE_SIZE);
                    }}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                      filter === tab.id ? "bg-surface text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground",
                    )}
                  >
                    {tab.label} <span className="tabular-nums text-muted">{count}</span>
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="Tidak ada aktivitas jenis ini" description="Coba pilih jenis lain atau tambah jaringan." />
            ) : (
              <>
                {shownGroups.map((group) => (
                  <section key={group.day} aria-label={`Aktivitas ${formatDate(group.items[0].timestamp)}`}>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {formatDate(group.items[0].timestamp)}
                    </h3>
                    <ol className="divide-y divide-line">
                      {group.items.map((activity) => (
                        <ActivityRow key={activity.id} activity={activity} />
                      ))}
                    </ol>
                  </section>
                ))}
                {filtered.length > visible ? (
                  <button
                    type="button"
                    onClick={() => setVisible((count) => count + PAGE_SIZE)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <ChevronDown className="size-3.5" aria-hidden />
                    Tampilkan lebih banyak ({filtered.length - visible} lagi)
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}
      </Panel>
    </EvidenceProvider>
  );
}
