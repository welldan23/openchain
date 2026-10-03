import { Receipt } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerTxUrl } from "@/lib/chains";
import { formatDateTime } from "@/lib/format";
import type { ChainId, EvidenceItem, RiskFinding } from "@/lib/types";

interface EvidencePanelProps {
  chain: ChainId;
  evidence: EvidenceItem[];
  findings: RiskFinding[];
}

export function EvidencePanel({ chain, evidence, findings }: EvidencePanelProps) {
  const findingTitle = new Map(findings.map((finding) => [finding.id, finding.title]));

  return (
    <Panel
      id="bukti"
      title="Bukti transaksi"
      description="Transaksi sumber yang mendukung temuan di halaman ini."
      icon={Receipt}
    >
      {evidence.length === 0 ? (
        <EmptyState
          title="Belum ada bukti transaksi"
          description="Bukti muncul saat ada temuan yang didukung transaksi on-chain."
        />
      ) : (
        <ol className="space-y-3">
          {evidence.map((item) => (
            <li key={item.txHash} className="rounded-lg border border-line bg-surface-raised p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <HashLink
                  value={item.txHash}
                  href={explorerTxUrl(chain, item.txHash)}
                  head={10}
                  tail={6}
                  copyLabel="Salin hash transaksi"
                />
                <ClassificationBadge classification={item.classification} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">{item.summary}</p>
              <time dateTime={item.timestamp} className="mt-2 block text-[11px] text-muted">
                {formatDateTime(item.timestamp)}
              </time>
              {item.relatedFindingIds.length > 0 ? (
                <p className="mt-2 text-[11px] text-muted">
                  Mendukung:{" "}
                  <span className="text-foreground/80">
                    {item.relatedFindingIds
                      .map((id) => findingTitle.get(id))
                      .filter(Boolean)
                      .join("; ")}
                  </span>
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
