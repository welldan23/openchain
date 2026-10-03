import { Users } from "lucide-react";
import { EntityLabelBadge } from "@/components/badges";
import { BarList } from "@/components/charts/bar-list";
import { StackedShareBar } from "@/components/charts/stacked-share-bar";
import { ClassificationBadge } from "@/components/classification-badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerAddressUrl } from "@/lib/chains";
import { ORDINAL_BLUE, SERIES_1 } from "@/lib/chart-colors";
import { formatPct, formatTokenAmount } from "@/lib/format";
import {
  buildSupplyTiers,
  describeLabelSources,
  groupHoldersByLabel,
} from "@/lib/holder-distribution";
import type { ChainId, HolderConcentration, TokenHolder } from "@/lib/types";

interface HoldersPanelProps {
  chain: ChainId;
  symbol: string;
  totalSupply: number;
  concentration: HolderConcentration;
  holders: TokenHolder[];
}

function SubHeading({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}

export function HoldersPanel({ chain, symbol, totalSupply, concentration, holders }: HoldersPanelProps) {
  const tiers = buildSupplyTiers(holders, concentration);
  const labelGroups = groupHoldersByLabel(holders);
  // Batang % supply di tabel diukur relatif ke holder terbesar supaya perbedaannya terlihat.
  const maxShare = Math.max(...holders.map((holder) => holder.sharePct), 1);

  return (
    <Panel
      id="pemegang"
      title="Sebaran pemegang"
      description="Bagaimana supply terbagi antar-holder dan siapa saja pemegang terbesarnya."
      icon={Users}
      action={<ClassificationBadge classification={concentration.classification} />}
    >
      {holders.length === 0 ? (
        <EmptyState
          title="Belum ada data pemegang"
          description="Daftar holder akan muncul setelah transfer token terindeks dari blockchain."
        />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="sebaran-peringkat">
            <SubHeading
              id="sebaran-peringkat"
              title="Supply per peringkat holder"
              note={`10 teratas ${formatPct(concentration.top10Pct)} · 50 teratas ${formatPct(concentration.top50Pct)}`}
            />
            <StackedShareBar
              label="Sebaran supply per peringkat holder"
              segments={tiers.map((tier, index) => ({
                id: tier.id,
                label: tier.label,
                share: tier.pct,
                valueText: formatPct(tier.pct),
                detailText: [
                  formatTokenAmount((tier.pct / 100) * totalSupply, symbol),
                  tier.holderName,
                ]
                  .filter(Boolean)
                  .join(" · "),
                color: ORDINAL_BLUE[index],
              }))}
            />
          </section>

          <section aria-labelledby="sebaran-label">
            <SubHeading
              id="sebaran-label"
              title="10 teratas menurut label"
              note="Asal label tertulis di tiap baris"
            />
            <BarList
              label="Porsi supply 10 holder teratas menurut label entitas"
              color={SERIES_1}
              items={labelGroups.map((group) => ({
                id: group.type,
                label: group.label,
                value: group.pct,
                valueText: formatPct(group.pct),
                detailText: `${group.count} address · ${describeLabelSources(group.sources)}`,
              }))}
            />
          </section>

          <section aria-labelledby="sebaran-tabel">
            <SubHeading id="sebaran-tabel" title="10 holder teratas" />
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Daftar 10 pemegang {symbol} terbesar</caption>
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pl-4 pr-2 font-medium sm:pl-5">#</th>
                    <th scope="col" className="px-2 py-2 font-medium">Address</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                      Saldo
                    </th>
                    <th scope="col" className="whitespace-nowrap py-2 pl-2 pr-4 text-right font-medium sm:pr-5">
                      % supply
                    </th>
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
                        {formatTokenAmount(holder.balance, symbol)}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 sm:pr-5">
                        <div className="flex items-center justify-end gap-2">
                          <span aria-hidden className="hidden h-1.5 w-16 sm:block">
                            <span
                              className="block h-full rounded-r-[4px]"
                              style={{
                                width: `${(holder.sharePct / maxShare) * 100}%`,
                                backgroundColor: SERIES_1,
                              }}
                            />
                          </span>
                          <span className="w-12 text-right tabular-nums">{formatPct(holder.sharePct)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </Panel>
  );
}
