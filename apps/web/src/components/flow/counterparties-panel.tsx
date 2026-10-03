import { ArrowDownLeft, ArrowUpRight, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { SERIES_1 } from "@/lib/chart-colors";
import { formatUsdCompact, shortenHash } from "@/lib/format";
import { addressTitle, type CounterpartyFlow } from "@/lib/fund-flow";

function counterpartyName(item: CounterpartyFlow): string {
  return item.label ? addressTitle(item.label) : shortenHash(item.address);
}

function counterpartyDetail(item: CounterpartyFlow): string {
  // Urut dari yang paling penting, karena teks bisa terpotong di layar sempit.
  return [
    item.label ? shortenHash(item.address) : null,
    `${item.transferCount} transfer`,
    item.assets.join(", "),
    item.label ? (item.label.source === "external" ? "label eksternal" : "heuristic") : "tanpa label",
    item.unpricedCount > 0 ? `${item.unpricedCount} tanpa harga` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

interface SideProps {
  id: string;
  title: string;
  icon: LucideIcon;
  items: CounterpartyFlow[];
  emptyText: string;
}

function CounterpartySide({ id, title, icon: Icon, items, emptyText }: SideProps) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
          {emptyText}
        </p>
      ) : (
        <BarList
          label={title}
          color={SERIES_1}
          items={items.map((item) => ({
            id: item.address,
            label: counterpartyName(item),
            value: item.totalUsd,
            valueText: item.totalUsd > 0 ? formatUsdCompact(item.totalUsd) : "Tanpa harga",
            detailText: counterpartyDetail(item),
          }))}
        />
      )}
    </section>
  );
}

interface CounterpartiesPanelProps {
  sources: CounterpartyFlow[];
  destinations: CounterpartyFlow[];
}

export function CounterpartiesPanel({ sources, destinations }: CounterpartiesPanelProps) {
  return (
    <Panel
      id="lawan-transaksi"
      title="Dari mana dan ke mana dana bergerak"
      description="Lawan transaksi dengan nilai transfer terbesar, dijumlahkan dalam USD saat transaksi."
      icon={Users}
      action={<ClassificationBadge classification="calculation" />}
    >
      {sources.length === 0 && destinations.length === 0 ? (
        <EmptyState
          title="Belum ada lawan transaksi"
          description="Address ini belum mengirim atau menerima dana pada rentang waktu yang dipilih."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <CounterpartySide
            id="sumber-dana"
            title="Sumber dana terbesar"
            icon={ArrowDownLeft}
            items={sources}
            emptyText="Belum ada dana masuk pada rentang ini."
          />
          <CounterpartySide
            id="tujuan-dana"
            title="Tujuan dana terbesar"
            icon={ArrowUpRight}
            items={destinations}
            emptyText="Belum ada dana keluar pada rentang ini."
          />
        </div>
      )}
    </Panel>
  );
}
