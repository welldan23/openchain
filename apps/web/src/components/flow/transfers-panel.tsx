import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { Badge } from "@/components/ui/badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/chains";
import { formatDateTime, formatTokenAmount, formatUsdCompact } from "@/lib/format";
import { FLOW_DIRECTION_META } from "@/lib/labels";
import type { ChainId, FlowTransfer } from "@/lib/types";

interface TransfersPanelProps {
  chain: ChainId;
  /** Sudah diurutkan dari yang terbaru. */
  transfers: FlowTransfer[];
}

export function TransfersPanel({ chain, transfers }: TransfersPanelProps) {
  return (
    <Panel
      id="transfer"
      title="Semua transfer"
      description="Setiap dana masuk dan keluar beserta hash transaksi sebagai bukti."
      icon={ArrowLeftRight}
      action={<ClassificationBadge classification="fact" />}
    >
      {transfers.length === 0 ? (
        <EmptyState
          title="Belum ada transfer"
          description="Transfer masuk dan keluar akan muncul di sini setelah terindeks dari blockchain."
        />
      ) : (
        <ol className="divide-y divide-line">
          {transfers.map((transfer) => {
            const meta = FLOW_DIRECTION_META[transfer.direction];
            const Icon = transfer.direction === "in" ? ArrowDownLeft : ArrowUpRight;
            return (
              <li
                key={transfer.id}
                className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_1fr_auto] sm:items-center sm:gap-4"
              >
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
          })}
        </ol>
      )}
    </Panel>
  );
}
