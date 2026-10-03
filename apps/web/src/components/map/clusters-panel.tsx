import { Boxes } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { formatPct } from "@/lib/format";
import { NEUTRAL_NODE_COLOR, type ClusterStyle } from "@/lib/wallet-map";

/** Legenda warna klaster sekaligus penjelasan alasan pengelompokannya. */
export function ClustersPanel({ styles }: { styles: ClusterStyle[] }) {
  return (
    <Panel
      id="klaster"
      title="Klaster & legenda"
      description="Warna gelembung menunjukkan kelompok wallet yang diduga terkait."
      icon={Boxes}
      action={<ClassificationBadge classification="heuristic" />}
    >
      <div className="space-y-4">
        {styles.length === 0 ? (
          <EmptyState title="Belum ada klaster" description="Belum ditemukan pola yang cukup kuat untuk mengelompokkan wallet." />
        ) : (
          <ul className="space-y-3">
            {styles.map((style) => (
              <li key={style.cluster.id} className="rounded-lg border border-line p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: style.color ?? NEUTRAL_NODE_COLOR }}
                  />
                  {style.cluster.name}
                  {style.color === null ? <span className="text-[11px] font-normal text-muted">(warna lainnya)</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {style.memberCount} wallet · {formatPct(style.sharePct)} supply
                </p>
                <p className="mt-2 text-xs leading-relaxed text-foreground/80">{style.cluster.reason}</p>
              </li>
            ))}
          </ul>
        )}

        <dl className="space-y-2 border-t border-line pt-4 text-xs">
          <div className="flex items-center gap-2">
            <dt className="flex w-10 shrink-0 justify-center">
              <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: NEUTRAL_NODE_COLOR }} />
            </dt>
            <dd className="text-muted">Wallet tanpa klaster</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="flex w-10 shrink-0 justify-center">
              <span aria-hidden className="size-3 rounded-full border-2" style={{ borderColor: NEUTRAL_NODE_COLOR }} />
            </dt>
            <dd className="text-muted">Bukan holder, muncul karena terhubung</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="flex w-10 shrink-0 justify-center">
              <svg aria-hidden width="32" height="4" className="text-muted">
                <line x1="1" y1="2" x2="31" y2="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 4" />
              </svg>
            </dt>
            <dd className="text-muted">Pendanaan native coin (mis. ETH, SOL)</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="flex w-10 shrink-0 justify-center">
              <svg aria-hidden width="32" height="4" className="text-muted">
                <line x1="1" y1="2" x2="31" y2="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </dt>
            <dd className="text-muted">Transfer token</dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}
