import type { LucideIcon } from "lucide-react";
import { CircleCheck, CircleDashed, CircleX, FileSearch, TriangleAlert } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { Badge } from "@/components/ui/badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerTxUrl } from "@/lib/chains";
import { countContractChecks, sortContractChecks } from "@/lib/contract-check";
import { CHECK_STATUS_META } from "@/lib/labels";
import type { ChainId, ContractCheck, ContractCheckStatus } from "@/lib/types";

const STATUS_ICONS: Record<ContractCheckStatus, LucideIcon> = {
  fail: CircleX,
  warn: TriangleAlert,
  unknown: CircleDashed,
  pass: CircleCheck,
};

interface ContractCheckPanelProps {
  chain: ChainId;
  contract: ContractCheck;
}

export function ContractCheckPanel({ chain, contract }: ContractCheckPanelProps) {
  const items = sortContractChecks(contract.items);
  const counts = countContractChecks(contract.items);

  return (
    <Panel
      id="kontrak"
      title="Cek kontrak"
      description={`Izin dan fungsi kontrak ${contract.standard} yang bisa merugikan holder.`}
      icon={FileSearch}
    >
      {items.length === 0 ? (
        <EmptyState
          title="Belum ada hasil cek kontrak"
          description="Pemeriksaan berjalan setelah kode dan state kontrak selesai terindeks."
        />
      ) : (
        <>
          <ul aria-label="Rekap hasil pemeriksaan" className="flex flex-wrap gap-1.5">
            {counts.map(({ status, count }) => (
              <li key={status}>
                <Badge className={CHECK_STATUS_META[status].className}>
                  {count} {CHECK_STATUS_META[status].label.toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>

          <ul className="mt-4 divide-y divide-line">
            {items.map((item) => {
              const meta = CHECK_STATUS_META[item.status];
              const Icon = STATUS_ICONS[item.status];
              return (
                <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${meta.iconClass}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="text-sm font-medium text-foreground">{item.label}</h3>
                      <span className="sr-only">Status: {meta.label}.</span>
                      <p className="text-sm text-foreground/90">{item.value}</p>
                    </div>
                    {item.description ? (
                      <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
                    ) : null}
                    {item.classification || item.evidenceTxHashes.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {item.classification ? (
                          <ClassificationBadge classification={item.classification} />
                        ) : null}
                        {item.evidenceTxHashes.map((hash) => (
                          <HashLink
                            key={hash}
                            value={hash}
                            href={explorerTxUrl(chain, hash)}
                            copyLabel="Salin hash transaksi"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
