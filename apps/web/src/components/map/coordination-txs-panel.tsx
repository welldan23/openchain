"use client";

import { ArrowRight, ListOrdered } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, formatTokenAmount, formatUsdCompact, shortenHash } from "@/lib/format";
import { addressKey, addressTitle } from "@/lib/fund-flow";
import { COORDINATION_KIND_META, COORDINATION_TX_ACTION_META } from "@/lib/labels";
import type { ChainId, CoordinationEvent, EntityLabel } from "@/lib/types";
import { sameBlockCount, sortCoordination, sortCoordinationTxs } from "@/lib/wallet-map";

interface CoordinationTxsPanelProps {
  chain: ChainId;
  events: CoordinationEvent[];
  /** Kejadian yang transaksinya ditampilkan. */
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Label wallet di peta, untuk menamai pengirim dan penerima. */
  labels: Map<string, EntityLabel | undefined>;
}

/** Nama wallet beserta address pendek, karena beberapa wallet bisa berlabel sama. */
function Party({ name, address }: { name: string; address: string }) {
  const short = shortenHash(address, 4, 4);
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1" title={address}>
      <span className="truncate font-medium">{name}</span>
      {name !== shortenHash(address) ? <span className="shrink-0 font-mono text-[11px] text-muted">{short}</span> : null}
    </span>
  );
}

/**
 * Transaksi on-chain yang mendukung satu temuan koordinasi. Transaksinya
 * fakta; kesimpulan bahwa wallet-wallet itu bergerak serempak adalah dugaan.
 */
export function CoordinationTxsPanel({ chain, events, activeId, onSelect, labels }: CoordinationTxsPanelProps) {
  const sorted = sortCoordination(events);
  const active = sorted.find((event) => event.id === activeId) ?? sorted[0];
  if (!active) return null;
  const txs = sortCoordinationTxs(active.transactions);
  const blockCounts = new Map<number, number>();
  for (const tx of txs) blockCounts.set(tx.blockNumber, (blockCounts.get(tx.blockNumber) ?? 0) + 1);
  const position = getChain(chain).addressFormat === "solana" ? "Slot" : "Blok";
  const shared = sameBlockCount(txs);
  const name = (address: string) => {
    const label = labels.get(addressKey(chain, address));
    return label ? addressTitle(label) : shortenHash(address);
  };

  return (
    <Panel
      id="transaksi-koordinasi"
      title="Transaksi pendukung"
      description={`${COORDINATION_KIND_META[active.kind].label}: ${txs.length} transaksi${shared > 0 ? `, ${shared} di ${position.toLowerCase()} yang sama` : ""}.`}
      icon={ListOrdered}
      action={<ClassificationBadge classification="fact" />}
    >
      <div className="space-y-4">
        {sorted.length > 1 ? (
          <div role="group" aria-label="Pilih temuan koordinasi" className="flex flex-wrap gap-2">
            {sorted.map((event) => (
              <button
                key={event.id}
                type="button"
                aria-pressed={event.id === active.id}
                onClick={() => onSelect(event.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  event.id === active.id
                    ? "bg-surface text-foreground ring-foreground/50"
                    : "bg-surface-raised text-foreground/80 ring-line hover:text-foreground",
                )}
              >
                {COORDINATION_KIND_META[event.kind].label}
                <span className="ml-1.5 tabular-nums text-muted">{event.transactions.length}</span>
              </button>
            ))}
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-foreground/85">{active.detail}</p>

        <ol className="divide-y divide-line">
          {txs.map((tx, index) => {
            const meta = COORDINATION_TX_ACTION_META[tx.action];
            const sharesBlock = (blockCounts.get(tx.blockNumber) ?? 0) > 1;
            return (
              <li
                key={`${tx.txHash}-${index}`}
                className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4"
              >
                <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
                  <Badge className={meta.className}>{meta.label}</Badge>
                  <span className="text-[11px] text-muted">
                    {position} {formatNumber(tx.blockNumber)}
                    {sharesBlock ? <span className="ml-1 text-foreground/80">· sama</span> : null}
                  </span>
                  <time dateTime={tx.timestamp} className="text-[11px] text-muted">
                    {formatDateTime(tx.timestamp)}
                  </time>
                </div>
                <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                  <Party name={name(tx.from)} address={tx.from} />
                  <ArrowRight className="size-3 shrink-0 text-muted" aria-hidden />
                  <span className="sr-only">ke</span>
                  <Party name={name(tx.to)} address={tx.to} />
                </p>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
                  <span className="text-xs font-medium tabular-nums">
                    {formatTokenAmount(tx.amount, tx.asset.symbol)}
                    <span className="font-normal text-muted">
                      {" "}
                      · {tx.amountUsd !== undefined ? formatUsdCompact(tx.amountUsd) : "harga tidak diketahui"}
                    </span>
                  </span>
                  <EvidenceTrigger txHash={tx.txHash} />
                </div>
              </li>
            );
          })}
        </ol>

        <p className="text-[11px] leading-relaxed text-muted">
          Setiap baris adalah transaksi yang tercatat di blockchain; klik hash untuk bukti lengkap. Kesimpulan bahwa
          wallet-wallet ini bergerak serempak tetap dugaan dengan {COORDINATION_KIND_META[active.kind].label.toLowerCase()}{" "}
          sebagai polanya.
        </p>
      </div>
    </Panel>
  );
}
