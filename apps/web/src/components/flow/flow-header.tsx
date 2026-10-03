import { CalendarRange, Clock, Database, ExternalLink, Waypoints } from "lucide-react";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { CopyButton } from "@/components/ui/copy-button";
import { explorerAddressUrl, getChain } from "@/lib/chains";
import { formatDate } from "@/lib/format";
import { addressTitle } from "@/lib/fund-flow";
import { describeSnapshot } from "@/lib/snapshot";
import type { AddressFlow } from "@/lib/types";

export function FlowHeader({ flow }: { flow: AddressFlow }) {
  const chain = getChain(flow.chain);
  const snap = describeSnapshot(flow.snapshot, flow.chain);

  return (
    <section aria-labelledby="flow-title" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
            <Waypoints className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">Lacak aliran dana</p>
            <h1 id="flow-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {addressTitle(flow.label)}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ChainBadge chain={flow.chain} />
              {flow.label ? <EntityLabelBadge label={flow.label} /> : null}
            </div>
            <div className="mt-3 flex min-w-0 items-center gap-1">
              <span className="text-xs text-muted">Address</span>
              <span className="min-w-0 truncate font-mono text-xs text-foreground/90" title={flow.address}>
                {flow.address}
              </span>
              <CopyButton value={flow.address} label="Salin address" />
            </div>
          </div>
        </div>

        <a
          href={explorerAddressUrl(flow.chain, flow.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
        >
          Lihat di {chain.explorer.name}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-raised px-3 py-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="size-3.5" aria-hidden />
          Periode:{" "}
          <span className="text-foreground/80">
            <time dateTime={flow.window.from}>{formatDate(flow.window.from)}</time> –{" "}
            <time dateTime={flow.window.to}>{formatDate(flow.window.to)}</time>
          </span>
        </span>
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <Clock className="size-3.5" aria-hidden />
          Snapshot data:{" "}
          <time dateTime={flow.snapshot.fetchedAt} className="text-foreground/80">
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
