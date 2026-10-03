import { Info, Route, Spline } from "lucide-react";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerAddressUrl } from "@/lib/chains";
import { formatDate, formatNumber, formatUsdCompact } from "@/lib/format";
import type { DetectedInfrastructure } from "@/lib/multichain";

/**
 * Bridge dan router yang pernah dipakai address ini, lintas chain. Interaksi
 * dengan infrastruktur seperti ini tidak dianggap tanda keterkaitan antar
 * wallet, karena dipakai banyak orang.
 */
export function InfrastructurePanel({ items }: { items: DetectedInfrastructure[] }) {
  const bridges = items.filter((item) => item.type === "bridge").length;
  const routers = items.length - bridges;
  return (
    <Panel
      id="jembatan-router"
      title="Jembatan & router terdeteksi"
      description={
        items.length > 0 ? `${bridges} bridge · ${routers} router di jaringan terpilih` : "Infrastruktur yang dipakai address ini."
      }
      icon={Route}
      action={<ClassificationBadge classification="external_label" />}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={Spline}
          title="Belum ada bridge atau router"
          description="Address ini tidak bertransaksi dengan bridge atau router berlabel di jaringan terpilih."
        />
      ) : (
        <div className="space-y-4">
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.key} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <EntityLabelBadge label={item.label} />
                  <span className="text-xs font-medium tabular-nums">{formatUsdCompact(item.totalUsd)}</span>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {formatNumber(item.interactions)} interaksi · terakhir {formatDate(item.lastAt)}
                </p>
                <ul className="mt-2 space-y-1" aria-label={`Address ${item.label.name ?? item.type} per jaringan`}>
                  {item.addresses.map((entry) => (
                    <li key={`${entry.chain}:${entry.address}`} className="flex flex-wrap items-center gap-1.5">
                      <ChainBadge chain={entry.chain} />
                      <HashLink value={entry.address} href={explorerAddressUrl(entry.chain, entry.address)} copyLabel="Salin address" />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Bridge dan router dipakai banyak orang, jadi transaksi lewat mereka tidak dihitung sebagai tanda dua wallet
            saling terkait. Jenisnya berasal dari label sumber luar; tap badge untuk melihat sumbernya.
          </p>
        </div>
      )}
    </Panel>
  );
}
