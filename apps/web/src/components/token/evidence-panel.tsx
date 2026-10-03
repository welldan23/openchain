import { ExternalLink, Receipt } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { evidenceAnchorId, findingAnchorId } from "@/lib/anchors";
import { explorerTxUrl, getChain } from "@/lib/chains";
import { formatDateTime, shortenHash } from "@/lib/format";
import type { ChainId, EvidenceItem, RiskFinding } from "@/lib/types";

interface EvidencePanelProps {
  chain: ChainId;
  evidence: EvidenceItem[];
  findings: RiskFinding[];
}

export function EvidencePanel({ chain, evidence, findings }: EvidencePanelProps) {
  const explorerName = getChain(chain).explorer.name;
  const findingTitle = new Map(findings.map((finding) => [finding.id, finding.title]));
  const allHashes = evidence.map((item) => item.txHash).join("\n");

  return (
    <Panel
      id="bukti"
      title="Bukti transaksi"
      description={`Transaksi sumber yang mendukung temuan. Salin hash-nya atau cek langsung di ${explorerName}.`}
      icon={Receipt}
      action={
        evidence.length > 1 ? (
          <CopyButton value={allHashes} label="Salin semua hash" variant="labeled" />
        ) : null
      }
    >
      {evidence.length === 0 ? (
        <EmptyState
          title="Belum ada bukti transaksi"
          description="Bukti muncul saat ada temuan yang didukung transaksi on-chain."
        />
      ) : (
        <ol className="space-y-3">
          {evidence.map((item) => {
            const supported = item.relatedFindingIds.filter((id) => findingTitle.has(id));
            return (
              <li
                key={item.txHash}
                id={evidenceAnchorId(item.txHash)}
                className="scroll-mt-20 rounded-lg border border-line bg-surface-raised p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-foreground/90" title={item.txHash}>
                    {shortenHash(item.txHash, 10, 6)}
                  </span>
                  <ClassificationBadge classification={item.classification} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">{item.summary}</p>
                <time dateTime={item.timestamp} className="mt-2 block text-[11px] text-muted">
                  {formatDateTime(item.timestamp)}
                </time>
                {supported.length > 0 ? (
                  <p className="mt-2 text-[11px] text-muted">
                    Mendukung:{" "}
                    {supported.map((id, index) => (
                      <span key={id}>
                        {index > 0 ? "; " : null}
                        <a
                          href={`#${findingAnchorId(id)}`}
                          className="text-foreground/80 underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent"
                        >
                          {findingTitle.get(id)}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton value={item.txHash} label="Salin hash" variant="labeled" />
                  <a
                    href={explorerTxUrl(chain, item.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Lihat di {explorerName}
                    <span className="sr-only"> (tab baru)</span>
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
