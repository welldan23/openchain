import { ArrowDown, ArrowRight, Clock, Database, Footprints } from "lucide-react";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { HashLink } from "@/components/ui/hash-link";
import { explorerAddressUrl } from "@/lib/chains";
import { addressTitle } from "@/lib/fund-flow";
import { describeSnapshot } from "@/lib/snapshot";
import type { ChainId, EntityLabel, WalletTrace } from "@/lib/types";
import type { TraceSummary } from "@/lib/wallet-trace";

function Endpoint({
  role,
  chain,
  address,
  label,
}: {
  role: string;
  chain: ChainId;
  address: string;
  label?: EntityLabel;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface-raised px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{role}</p>
      <p className="mt-1 truncate text-sm font-medium">{addressTitle(label)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <HashLink value={address} href={explorerAddressUrl(chain, address)} copyLabel={`Salin address ${role.toLowerCase()}`} />
        {label ? <EntityLabelBadge label={label} /> : null}
      </div>
    </div>
  );
}

export function TraceHeader({ trace, summary }: { trace: WalletTrace; summary: TraceSummary }) {
  const snap = describeSnapshot(trace.snapshot, trace.chain);
  const facts = [
    summary.hopCount > 0 ? `${summary.hopCount} langkah` : `Tidak ada jalur dalam ${trace.maxHops} langkah`,
    summary.hopCount > 1 ? `selama ${summary.durationText}` : null,
    summary.assets.length > 0 ? `aset ${summary.assets.join(", ")}` : null,
  ].filter(Boolean);

  return (
    <section aria-labelledby="trace-title" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
          <Footprints className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Telusur antar wallet</p>
          <h1 id="trace-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {addressTitle(trace.fromLabel)} → {addressTitle(trace.toLabel)}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ChainBadge chain={trace.chain} />
            <span className="text-xs text-muted">{facts.join(" · ")}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Endpoint role="Asal" chain={trace.chain} address={trace.from} label={trace.fromLabel} />
        <ArrowDown className="size-4 self-center text-muted sm:hidden" aria-hidden />
        <ArrowRight className="hidden size-4 shrink-0 text-muted sm:block" aria-hidden />
        <Endpoint role="Tujuan" chain={trace.chain} address={trace.to} label={trace.toLabel} />
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-raised px-3 py-2 text-[11px] text-muted">
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <Clock className="size-3.5" aria-hidden />
          Snapshot data:{" "}
          <time dateTime={trace.snapshot.fetchedAt} className="text-foreground/80">
            {snap.fetchedAt}
          </time>
          <span>({snap.fetchedAgo})</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Database className="size-3.5" aria-hidden />
          {snap.position}
        </span>
        <span>Sumber: {snap.sources}</span>
        <span>Batas pencarian: {trace.maxHops} langkah</span>
      </p>
    </section>
  );
}
