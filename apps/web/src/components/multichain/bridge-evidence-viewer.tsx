"use client";

import { ArrowRight, CircleCheck, CircleHelp, CircleX, ExternalLink, FileSearch, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { explorerTxUrl, getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTokenAmount, formatUsdCompact } from "@/lib/format";
import { BRIDGE_STATUS_META } from "@/lib/labels";
import { bridgeEvidenceAnchor, bridgeMatchChecks, type BridgeMatchCheck } from "@/lib/multichain";
import type { BridgeMove, ChainId } from "@/lib/types";

const CHECK_ICONS: Record<"true" | "false" | "null", { icon: LucideIcon; className: string; text: string }> = {
  true: { icon: CircleCheck, className: "text-emerald-400", text: "Lolos" },
  false: { icon: CircleX, className: "text-rose-400", text: "Tidak lolos" },
  null: { icon: CircleHelp, className: "text-muted", text: "Belum bisa dicek" },
};

function Leg({
  title,
  chain,
  hash,
  at,
  amount,
  symbol,
  emptyText,
}: {
  title: string;
  chain: ChainId;
  hash?: string;
  at?: string;
  amount?: number;
  symbol: string;
  emptyText: string;
}) {
  return (
    <section aria-label={title} className="min-w-0 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        <ChainBadge chain={chain} />
      </div>
      {hash && at ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm font-medium tabular-nums">{amount !== undefined ? formatTokenAmount(amount, symbol, { compact: false, maximumFractionDigits: 6 }) : "–"}</p>
          <p className="text-[11px] text-muted">
            <time dateTime={at}>{formatDateTime(at)}</time>
          </p>
          <p className="break-all rounded-md bg-surface-raised px-2 py-1.5 font-mono text-[11px] leading-relaxed">{hash}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={hash} label="Salin hash" variant="labeled" />
            <a
              href={explorerTxUrl(chain, hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent"
            >
              {getChain(chain).explorer.name}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-muted">{emptyText}</p>
      )}
    </section>
  );
}

function CheckRow({ check }: { check: BridgeMatchCheck }) {
  const meta = CHECK_ICONS[String(check.passed) as "true" | "false" | "null"];
  const Icon = meta.icon;
  return (
    <li className="flex gap-2">
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", meta.className)} aria-label={meta.text} />
      <div>
        <p className="text-xs font-medium">{check.label}</p>
        <p className="text-[11px] leading-relaxed text-muted">{check.detail}</p>
      </div>
    </li>
  );
}

/**
 * Tombol "Lihat bukti" untuk satu perpindahan bridge: membuka dialog berisi
 * kiriman dan penerimaan berdampingan beserta alasan pencocokannya. Bisa
 * dibuka langsung lewat tautan `#bukti-bridge-<id>`.
 */
export function BridgeEvidenceViewer({ move, snapshotAt }: { move: BridgeMove; snapshotAt: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [shareUrl, setShareUrl] = useState("");
  const anchor = bridgeEvidenceAnchor(move.id);
  const status = BRIDGE_STATUS_META[move.status];
  const checks = bridgeMatchChecks(move, snapshotAt);

  function open() {
    window.history.replaceState(window.history.state, "", `#${anchor}`);
    setShareUrl(window.location.href);
    dialogRef.current?.showModal();
  }

  useEffect(() => {
    function fromLocation() {
      if (window.location.hash !== `#${anchor}` || dialogRef.current?.open) return;
      setShareUrl(window.location.href);
      dialogRef.current?.showModal();
    }
    fromLocation();
    window.addEventListener("hashchange", fromLocation);
    return () => window.removeEventListener("hashchange", fromLocation);
  }, [anchor]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-foreground/90 underline decoration-line decoration-dotted underline-offset-4 transition hover:text-accent hover:decoration-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <FileSearch className="size-3.5" aria-hidden />
        Lihat bukti bridge
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${anchor}-title`}
        onClose={() => {
          if (window.location.hash === `#${anchor}`) {
            window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-line bg-surface p-0 text-foreground shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={`${anchor}-title`} className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              Bukti perpindahan bridge
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <ChainBadge chain={move.fromChain} />
              <ArrowRight className="size-3" aria-hidden />
              <ChainBadge chain={move.toChain} />
              <EntityLabelBadge label={move.bridge} interactive={false} />
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Tutup bukti bridge"
            className="inline-grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium tabular-nums">
              {formatTokenAmount(move.amountSent, move.asset.symbol, { compact: false, maximumFractionDigits: 6 })}
              {move.amountUsd !== undefined ? <span className="text-xs font-normal text-muted"> · {formatUsdCompact(move.amountUsd)}</span> : null}
            </p>
            <ClassificationBadge classification="fact" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Leg
              title="Kiriman"
              chain={move.fromChain}
              hash={move.sentTxHash}
              at={move.sentAt}
              amount={move.amountSent}
              symbol={move.asset.symbol}
              emptyText="-"
            />
            <Leg
              title="Penerimaan"
              chain={move.toChain}
              hash={move.receivedTxHash}
              at={move.receivedAt}
              amount={move.amountReceived}
              symbol={move.asset.symbol}
              emptyText={status.description}
            />
          </div>
          <section aria-label="Alasan pencocokan" className="rounded-lg bg-surface-raised p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold">Kenapa dianggap satu perpindahan</h3>
              <ClassificationBadge classification="heuristic" />
            </div>
            <ul className="mt-2 space-y-2">
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </ul>
          </section>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <CopyButton value={shareUrl} label="Salin tautan bukti" variant="labeled" />
            <p className="text-[11px] text-muted">Tautan membuka halaman ini dan langsung menampilkan bukti yang sama.</p>
          </div>
        </div>
      </dialog>
    </>
  );
}
