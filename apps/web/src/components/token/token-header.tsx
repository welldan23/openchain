import { BadgeCheck, CircleAlert, Clock, Database, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { ChainBadge, RiskLevelBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { HashLink } from "@/components/ui/hash-link";
import { explorerAddressUrl, explorerTokenUrl, explorerTxUrl, getChain } from "@/lib/chains";
import { formatAge, formatDate, formatTokenAmount } from "@/lib/format";
import { describeSnapshot } from "@/lib/snapshot";
import type { DataSnapshot, RiskLevel, TokenProfile } from "@/lib/types";

interface TokenHeaderProps {
  token: TokenProfile;
  riskLevel: RiskLevel;
  snapshot: DataSnapshot;
  /** Tombol tambahan di samping tautan explorer, mis. simpan ke kasus. */
  actions?: ReactNode;
}

export function TokenHeader({ token, riskLevel, snapshot, actions }: TokenHeaderProps) {
  const chain = getChain(token.chain);
  const snap = describeSnapshot(snapshot, token.chain);

  return (
    <section
      aria-labelledby="token-title"
      className="rounded-xl border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-full bg-linear-to-br from-teal-400/80 to-indigo-500/80 text-sm font-bold text-white ring-1 ring-white/10"
          >
            {token.symbol.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="token-title" className="text-xl font-semibold tracking-tight sm:text-2xl">
                {token.name}
              </h1>
              <span className="text-sm font-medium text-muted">{token.symbol}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ChainBadge chain={token.chain} />
              <RiskLevelBadge level={riskLevel} />
              {token.verified ? (
                <Badge className="bg-emerald-500/15 text-emerald-300 ring-emerald-400/30">
                  <BadgeCheck className="size-3" aria-hidden />
                  Kontrak terverifikasi
                </Badge>
              ) : (
                <Badge className="bg-slate-500/20 text-slate-300 ring-slate-400/30">
                  <CircleAlert className="size-3" aria-hidden />
                  Source belum terverifikasi
                </Badge>
              )}
            </div>
            <div className="mt-3 flex min-w-0 items-center gap-1">
              <span className="text-xs text-muted">Kontrak</span>
              <span className="min-w-0 truncate font-mono text-xs text-foreground/90" title={token.address}>
                {token.address}
              </span>
              <CopyButton value={token.address} label="Salin address kontrak" />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
          <a
            href={explorerTokenUrl(token.chain, token.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            Lihat di {chain.explorer.name}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          {actions}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-muted">Deployer</dt>
          <dd className="mt-1">
            <HashLink
              value={token.deployer}
              href={explorerAddressUrl(token.chain, token.deployer)}
              copyLabel="Salin address deployer"
            />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Dibuat</dt>
          <dd className="mt-1 text-foreground/90">
            {formatDate(token.deployedAt)}
            <span className="text-muted"> · umur {formatAge(token.deployedAt, snapshot.fetchedAt)}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Transaksi deploy</dt>
          <dd className="mt-1">
            <HashLink
              value={token.deployTxHash}
              href={explorerTxUrl(token.chain, token.deployTxHash)}
              copyLabel="Salin hash transaksi deploy"
            />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Total supply</dt>
          <dd className="mt-1 text-foreground/90">
            {formatTokenAmount(token.totalSupply, token.symbol, { compact: false })}
          </dd>
        </div>
      </dl>

      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-raised px-3 py-2 text-[11px] text-muted">
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <Clock className="size-3.5" aria-hidden />
          Snapshot data:{" "}
          <time dateTime={snapshot.fetchedAt} className="text-foreground/80">
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
