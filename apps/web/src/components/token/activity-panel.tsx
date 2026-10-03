import { Activity, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/chains";
import { formatDateTime, formatNumberCompact, formatUsdCompact, shortenHash } from "@/lib/format";
import { ACTIVITY_META } from "@/lib/labels";
import type { ChainId, TokenActivity } from "@/lib/types";

interface ActivityPanelProps {
  chain: ChainId;
  symbol: string;
  activity: TokenActivity[];
}

export function ActivityPanel({ chain, symbol, activity }: ActivityPanelProps) {
  return (
    <Panel
      id="aktivitas"
      title="Aktivitas token"
      description="Transaksi terbaru dan momen penting sejak token dibuat."
      icon={Activity}
    >
      <ol className="divide-y divide-line">
        {activity.map((item) => {
          const meta = ACTIVITY_META[item.type];
          return (
            <li
              key={item.id}
              className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_1fr_auto] sm:items-center sm:gap-4"
            >
              <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
                <Badge className={meta.className}>{meta.label}</Badge>
                <time dateTime={item.timestamp} className="text-[11px] text-muted">
                  {formatDateTime(item.timestamp)}
                </time>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-xs">
                <a
                  href={explorerAddressUrl(chain, item.from)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.from}
                  className="text-foreground/90 hover:text-accent hover:underline"
                >
                  {shortenHash(item.from)}
                </a>
                <ArrowRight className="size-3 text-muted" aria-hidden />
                <span className="sr-only">ke</span>
                <a
                  href={explorerAddressUrl(chain, item.to)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.to}
                  className="text-foreground/90 hover:text-accent hover:underline"
                >
                  {shortenHash(item.to)}
                </a>
              </div>

              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
                <span className="text-xs font-medium tabular-nums">
                  {formatNumberCompact(item.amount)} {symbol}
                  {item.amountUsd !== undefined ? (
                    <span className="font-normal text-muted"> · {formatUsdCompact(item.amountUsd)}</span>
                  ) : null}
                </span>
                <HashLink
                  value={item.txHash}
                  href={explorerTxUrl(chain, item.txHash)}
                  head={8}
                  tail={4}
                  copyLabel="Salin hash transaksi"
                />
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
