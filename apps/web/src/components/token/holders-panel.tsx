import { Users } from "lucide-react";
import { ClassificationBadge, EntityLabelBadge } from "@/components/badges";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { explorerAddressUrl } from "@/lib/chains";
import { formatNumberCompact, formatPct } from "@/lib/format";
import type { ChainId, HolderConcentration, TokenHolder } from "@/lib/types";

interface HoldersPanelProps {
  chain: ChainId;
  symbol: string;
  concentration: HolderConcentration;
  holders: TokenHolder[];
}

export function HoldersPanel({ chain, symbol, concentration, holders }: HoldersPanelProps) {
  // Batang % supply diukur relatif ke holder terbesar supaya perbedaannya terlihat.
  const maxShare = Math.max(...holders.map((holder) => holder.sharePct), 1);
  return (
    <Panel
      id="pemegang"
      title="Pemegang teratas"
      description="Konsentrasi supply dan siapa saja pemegang terbesarnya."
      icon={Users}
      action={<ClassificationBadge classification={concentration.classification} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "10 holder teratas", value: concentration.top10Pct },
          { label: "50 holder teratas", value: concentration.top50Pct },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-surface-raised p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted">{item.label}</span>
              <span className="text-sm font-semibold">{formatPct(item.value)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-accent" style={{ width: `${item.value}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto sm:-mx-5">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Daftar 10 pemegang {symbol} terbesar</caption>
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pl-4 pr-2 font-medium sm:pl-5">#</th>
              <th scope="col" className="px-2 py-2 font-medium">Address</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                Saldo
              </th>
              <th scope="col" className="py-2 pl-2 pr-4 text-right font-medium sm:pr-5">% supply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {holders.map((holder) => (
              <tr key={holder.address}>
                <td className="py-2.5 pl-4 pr-2 text-muted sm:pl-5">{holder.rank}</td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <HashLink
                      value={holder.address}
                      href={explorerAddressUrl(chain, holder.address)}
                      copyLabel="Salin address holder"
                    />
                    {holder.label ? <EntityLabelBadge label={holder.label} /> : null}
                  </div>
                </td>
                <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">
                  {formatNumberCompact(holder.balance)} {symbol}
                </td>
                <td className="py-2.5 pl-2 pr-4 sm:pr-5">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised sm:block">
                      <div
                        className="h-full rounded-full bg-accent/80"
                        style={{ width: `${(holder.sharePct / maxShare) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right tabular-nums">{formatPct(holder.sharePct)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
