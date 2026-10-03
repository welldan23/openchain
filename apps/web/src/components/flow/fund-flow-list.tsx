"use client";

import { ArrowDownLeft, ArrowUpRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import { EntityLabelBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { HashLink } from "@/components/ui/hash-link";
import { EmptyState } from "@/components/ui/states";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTokenAmount, formatUsdCompact } from "@/lib/format";
import { filterTransfers, type DirectionFilter } from "@/lib/fund-flow";
import { FLOW_DIRECTION_META } from "@/lib/labels";
import type { ChainId, FlowTransfer } from "@/lib/types";

/** Jumlah baris yang tampil sebelum tombol "Tampilkan lebih banyak". */
const PAGE_SIZE = 8;

const TABS: Array<{ id: DirectionFilter; label: string; totalLabel: string }> = [
  { id: "all", label: "Semua", totalLabel: "Selisih" },
  { id: "in", label: "Masuk", totalLabel: "Total masuk" },
  { id: "out", label: "Keluar", totalLabel: "Total keluar" },
];

const EMPTY_TEXT: Record<DirectionFilter, string> = {
  all: "Transfer masuk dan keluar akan muncul di sini setelah terindeks dari blockchain.",
  in: "Address ini belum menerima dana pada periode yang dianalisis.",
  out: "Address ini belum mengirim dana pada periode yang dianalisis.",
};

function signedUsd(value: number): string {
  return `${value > 0 ? "+" : ""}${formatUsdCompact(value)}`;
}

function TransferRow({ chain, transfer }: { chain: ChainId; transfer: FlowTransfer }) {
  const meta = FLOW_DIRECTION_META[transfer.direction];
  const Icon = transfer.direction === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <li className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_1fr_auto] sm:items-center sm:gap-4">
      <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
        <Badge className={meta.className}>
          <Icon className="size-3" aria-hidden />
          {meta.label}
        </Badge>
        <time dateTime={transfer.timestamp} className="text-[11px] text-muted">
          {formatDateTime(transfer.timestamp)}
        </time>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{transfer.direction === "in" ? "Dari" : "Ke"}</span>
        <HashLink
          value={transfer.counterparty}
          href={explorerAddressUrl(chain, transfer.counterparty)}
          copyLabel="Salin address lawan transaksi"
        />
        {transfer.counterpartyLabel ? <EntityLabelBadge label={transfer.counterpartyLabel} /> : null}
      </div>

      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
        <span className="text-xs font-medium tabular-nums">
          {formatTokenAmount(transfer.amount, transfer.asset.symbol)}
          <span className="font-normal text-muted">
            {" "}
            · {transfer.amountUsd !== undefined ? formatUsdCompact(transfer.amountUsd) : "harga tidak diketahui"}
          </span>
        </span>
        <HashLink
          value={transfer.txHash}
          href={explorerTxUrl(chain, transfer.txHash)}
          head={8}
          tail={4}
          copyLabel="Salin hash transaksi"
        />
      </div>
    </li>
  );
}

interface FundFlowListProps {
  chain: ChainId;
  /** Sudah diurutkan dari yang terbaru. */
  transfers: FlowTransfer[];
}

/**
 * Daftar dana masuk & keluar dengan tab arah. Setiap tab menyebut jumlah
 * transfer dan total USD-nya; transfer tanpa harga disebut terpisah.
 */
export function FundFlowList({ chain, transfers }: FundFlowListProps) {
  const [filter, setFilter] = useState<DirectionFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const active = TABS.find((tab) => tab.id === filter)!;
  const { items, totalUsd, unpricedCount } = filterTransfers(transfers, filter);
  const shown = items.slice(0, visible);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Pilih arah dana" className="inline-flex rounded-lg border border-line bg-surface-raised p-0.5">
          {TABS.map((tab) => {
            const count = filterTransfers(transfers, tab.id).items.length;
            const selected = tab.id === filter;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setFilter(tab.id);
                  setVisible(PAGE_SIZE);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  selected ? "bg-surface text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground",
                )}
              >
                {tab.label} <span className="tabular-nums text-muted">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {active.totalLabel}:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {filter === "all" ? signedUsd(totalUsd) : formatUsdCompact(totalUsd)}
          </span>
          {unpricedCount > 0 ? <span> · {unpricedCount} tanpa harga</span> : null}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title={filter === "all" ? "Belum ada transfer" : `Belum ada dana ${active.label.toLowerCase()}`} description={EMPTY_TEXT[filter]} />
      ) : (
        <>
          <ol className="divide-y divide-line">
            {shown.map((transfer) => (
              <TransferRow key={transfer.id} chain={chain} transfer={transfer} />
            ))}
          </ol>
          {items.length > shown.length ? (
            <button
              type="button"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ChevronDown className="size-3.5" aria-hidden />
              Tampilkan lebih banyak ({items.length - shown.length} lagi)
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
