import { ChevronRight, Clock, Database, Network } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChainBadge } from "@/components/badges";
import { CopyButton } from "@/components/ui/copy-button";
import { tokenPath } from "@/lib/api/tokens";
import { describeSnapshot } from "@/lib/snapshot";
import type { WalletMap } from "@/lib/types";

export function MapHeader({ map, actions }: { map: WalletMap; actions?: ReactNode }) {
  const snap = describeSnapshot(map.snapshot, map.chain);
  return (
    <section aria-labelledby="map-title" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
            <Network className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">Peta hubungan wallet</p>
            <h1 id="map-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              Holder {map.token.name} <span className="text-base font-medium text-muted">{map.token.symbol}</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ChainBadge chain={map.chain} />
            </div>
            <div className="mt-3 flex min-w-0 items-center gap-1">
              <span className="text-xs text-muted">Kontrak</span>
              <span className="min-w-0 truncate font-mono text-xs text-foreground/90" title={map.token.address}>
                {map.token.address}
              </span>
              <CopyButton value={map.token.address} label="Salin address kontrak" />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
          <Link
            href={tokenPath(map.chain, map.token.address)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            Buka halaman token
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
          {actions}
        </div>
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-raised px-3 py-2 text-[11px] text-muted">
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <Clock className="size-3.5" aria-hidden />
          Snapshot data:{" "}
          <time dateTime={map.snapshot.fetchedAt} className="text-foreground/80">
            {snap.fetchedAt}
          </time>
          <span>({snap.fetchedAgo})</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Database className="size-3.5" aria-hidden />
          {snap.position}
        </span>
        <span>Sumber: {snap.sources}</span>
      </p>
    </section>
  );
}
