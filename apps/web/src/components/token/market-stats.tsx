import { cn } from "@/lib/cn";
import {
  formatNumber,
  formatPctChange,
  formatUsdCompact,
  formatUsdPrice,
} from "@/lib/format";
import type { TokenMarket } from "@/lib/types";

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  subClassName?: string;
}

function Stat({ label, value, sub, subClassName }: StatProps) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</dd>
      {sub ? <dd className={cn("mt-0.5 truncate text-xs text-muted", subClassName)}>{sub}</dd> : null}
    </div>
  );
}

export function MarketStats({ market }: { market: TokenMarket }) {
  const change = market.priceChange24hPct;
  return (
    <section aria-label="Statistik pasar">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Harga"
          value={formatUsdPrice(market.priceUsd)}
          sub={`${formatPctChange(change)} 24 jam`}
          subClassName={change >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <Stat
          label="Market cap"
          value={formatUsdCompact(market.marketCapUsd)}
          sub={`FDV ${formatUsdCompact(market.fdvUsd)}`}
        />
        <Stat label="Likuiditas" value={formatUsdCompact(market.liquidityUsd)} />
        <Stat label="Volume 24 jam" value={formatUsdCompact(market.volume24hUsd)} />
        <Stat label="Holder" value={formatNumber(market.holderCount)} />
        <Stat label="Transaksi 24 jam" value={formatNumber(market.txCount24h)} />
      </dl>
    </section>
  );
}
