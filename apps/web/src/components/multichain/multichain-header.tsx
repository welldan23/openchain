import { CalendarRange, Clock, Globe2 } from "lucide-react";
import { EntityLabelBadge } from "@/components/badges";
import { CopyButton } from "@/components/ui/copy-button";
import { formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";
import { addressTitle } from "@/lib/fund-flow";
import type { MultichainSummary } from "@/lib/multichain";
import type { MultichainProfile } from "@/lib/types";

export function MultichainHeader({ profile, summary }: { profile: MultichainProfile; summary: MultichainSummary }) {
  const total = profile.chains.length;
  return (
    <section aria-labelledby="multichain-title" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
          <Globe2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Jelajah multichain</p>
          <h1 id="multichain-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {addressTitle(profile.label)}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {profile.label ? <EntityLabelBadge label={profile.label} /> : null}
            <span className="text-xs text-muted">
              Aktif di {summary.activeChains.length} dari {total} chain EVM
            </span>
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-1">
            <span className="text-xs text-muted">Address</span>
            <span className="min-w-0 truncate font-mono text-xs text-foreground/90" title={profile.address}>
              {profile.address}
            </span>
            <CopyButton value={profile.address} label="Salin address" />
          </div>
        </div>
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-raised px-3 py-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="size-3.5" aria-hidden />
          Periode data:{" "}
          <span className="text-foreground/80">
            {formatDate(profile.window.from)} – {formatDate(profile.window.to)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden />
          Snapshot:{" "}
          <time dateTime={profile.fetchedAt} className="text-foreground/80">
            {formatDateTime(profile.fetchedAt)}
          </time>
          <span>({formatRelativeTime(profile.fetchedAt)})</span>
        </span>
        <span>Blok snapshot tiap chain tertulis di kartunya</span>
        <span>Sumber: {profile.sources.join(", ")}</span>
      </p>
    </section>
  );
}
