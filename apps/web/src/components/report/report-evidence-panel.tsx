"use client";

import { Camera, ExternalLink, FileSearch, Paperclip } from "lucide-react";
import { useState } from "react";
import { ChainBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerTxUrl, getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import { reportBlockAnchor } from "@/lib/report";
import { filterEvidenceEntries, reportEvidenceEntries, type EvidenceFilter, type ReportEvidenceEntry } from "@/lib/report-evidence";
import type { InvestigationReport } from "@/lib/types";

const FILTERS: Array<{ id: EvidenceFilter; label: string }> = [
  { id: "all", label: "Semua" },
  { id: "not_embedded", label: "Belum tersemat" },
  { id: "no_detail", label: "Tanpa rincian" },
];

const ACTION =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent";

/**
 * Semua hash bukti di laporan beserta klaim pengutipnya dan tangkapan data
 * yang dipakai (waktu, blok, provider). Hash yang belum tersemat bisa
 * disematkan ke bagian "Bukti utama".
 */
export function ReportEvidencePanel({ report, onEmbed }: { report: InvestigationReport; onEmbed: (entry: ReportEvidenceEntry) => void }) {
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const entries = reportEvidenceEntries(report);
  const shown = filterEvidenceEntries(entries, filter);
  const counts: Record<EvidenceFilter, number> = {
    all: entries.length,
    not_embedded: filterEvidenceEntries(entries, "not_embedded").length,
    no_detail: filterEvidenceEntries(entries, "no_detail").length,
  };

  return (
    <Panel
      id="bukti-laporan"
      title="Bukti transaksi & tangkapan data"
      description={`${entries.length} hash bukti di laporan ini`}
      icon={FileSearch}
      action={entries.length > 0 ? <CopyButton value={entries.map((item) => item.txHash).join("\n")} label="Salin semua hash" variant="labeled" /> : undefined}
    >
      {entries.length === 0 ? (
        <EmptyState icon={FileSearch} title="Belum ada bukti" description="Hash bukti muncul di sini setelah klaim atau bukti tersemat ditambahkan." />
      ) : (
        <>
          <div role="group" aria-label="Saring bukti" className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  filter === item.id ? "bg-accent/15 text-accent ring-accent/50" : "bg-surface text-muted ring-line hover:text-foreground",
                )}
              >
                {item.label} <span className="tabular-nums">{counts[item.id]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="mt-3 text-xs text-muted">Tidak ada bukti di saringan ini.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {shown.map((entry) => (
                <li key={entry.txHash} className="space-y-2.5 rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      {entry.chain ? <ChainBadge chain={entry.chain} /> : <span>Chain belum diketahui</span>}
                      {entry.detail ? (
                        <time dateTime={entry.detail.timestamp}>{formatDateTime(entry.detail.timestamp)}</time>
                      ) : null}
                      {entry.detail ? <span>· {entry.detail.movements.length} perpindahan</span> : null}
                    </span>
                    <ClassificationBadge classification={entry.detail ? "fact" : "unavailable"} />
                  </div>
                  <p className="break-all rounded-md bg-surface-raised px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">{entry.txHash}</p>

                  <div className="text-xs">
                    <p className="text-[11px] text-muted">Dikutip oleh</p>
                    {entry.citedBy.length === 0 ? (
                      <p className="mt-0.5 text-muted">Belum dikutip klaim mana pun; hanya tersemat sebagai bukti.</p>
                    ) : (
                      <ul className="mt-0.5 space-y-0.5">
                        {entry.citedBy.map((item) => (
                          <li key={item.blockId}>
                            <a href={`#${reportBlockAnchor(item.blockId)}`} className="hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                              {item.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <p className="flex items-start gap-1.5 rounded-md border border-dashed border-line px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
                    <Camera className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      Tangkapan data: <time dateTime={entry.capture.fetchedAt}>{formatDateTime(entry.capture.fetchedAt)}</time>
                      {entry.capture.blockNumber !== null && entry.chain
                        ? ` · ${getChain(entry.chain).addressFormat === "solana" ? "slot" : "blok"} ${formatNumber(entry.capture.blockNumber)}`
                        : " · blok tidak diketahui"}
                      {entry.capture.sources.length > 0 ? ` · ${entry.capture.sources.join(", ")}` : null}
                      {entry.detail ? null : ". Rincian transaksi ini tidak ikut tertangkap; buka di explorer."}
                    </span>
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    {entry.detail ? <EvidenceTrigger txHash={entry.txHash} /> : null}
                    <CopyButton value={entry.txHash} label="Salin hash" variant="labeled" />
                    {entry.chain ? (
                      <a href={explorerTxUrl(entry.chain, entry.txHash)} target="_blank" rel="noopener noreferrer" className={ACTION}>
                        {getChain(entry.chain).explorer.name}
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                    {entry.embeddedBlockId ? (
                      <a href={`#${reportBlockAnchor(entry.embeddedBlockId)}`} className="text-[11px] text-accent hover:underline">
                        Sudah tersemat di laporan
                      </a>
                    ) : entry.chain ? (
                      <button type="button" onClick={() => onEmbed(entry)} className={ACTION}>
                        <Paperclip className="size-3.5" aria-hidden />
                        Sematkan ke laporan
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted">Belum bisa disematkan karena chain-nya belum diketahui.</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Panel>
  );
}
