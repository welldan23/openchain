"use client";

import { CircleCheck, FileSearch, ListFilter, OctagonAlert } from "lucide-react";
import { useState } from "react";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { CLASSIFICATION_META, CLASSIFICATION_STRIPE, RISK_TONES } from "@/lib/labels";
import { claimClassificationCounts, filterClaims, reportBlockAnchor, reportClaims, type ClaimOrder } from "@/lib/report";
import type { FindingClassification, InvestigationReport } from "@/lib/types";

const CHIP =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Daftar semua klaim di laporan dengan penanda jenis informasinya, bisa
 * disaring per jenis dan diurutkan dari bukti terkuat. Tiap klaim menuju
 * letaknya di dokumen.
 */
export function ReportFindingsIndex({ report }: { report: InvestigationReport }) {
  const [filter, setFilter] = useState<FindingClassification | null>(null);
  const [order, setOrder] = useState<ClaimOrder>("document");
  const entries = reportClaims(report);
  const counts = claimClassificationCounts(entries);
  // Bila jenis yang dipilih sudah tidak ada (mis. klaimnya dihapus), kembali ke semua.
  const active = filter && counts.some((item) => item.classification === filter) ? filter : null;
  const shown = filterClaims(entries, active, order);

  return (
    <Panel id="daftar-temuan" title="Daftar temuan" description={`${entries.length} klaim dengan jenis informasinya`} icon={ListFilter}>
      {entries.length === 0 ? (
        <EmptyState icon={FileSearch} title="Belum ada temuan" description="Pilih temuan dari kasus sumber untuk mulai menyusun laporan." />
      ) : (
        <>
          <div role="group" aria-label="Saring jenis informasi" className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={active === null}
              onClick={() => setFilter(null)}
              className={cn(CHIP, active === null ? "bg-accent/15 text-accent ring-accent/50" : "bg-surface text-muted ring-line hover:text-foreground")}
            >
              Semua <span className="tabular-nums">{entries.length}</span>
            </button>
            {counts.map(({ classification, count }) => (
              <button
                key={classification}
                type="button"
                aria-pressed={active === classification}
                onClick={() => setFilter(active === classification ? null : classification)}
                className={cn(
                  CHIP,
                  active === classification ? CLASSIFICATION_META[classification].className : "bg-surface text-muted ring-line hover:text-foreground",
                )}
              >
                {CLASSIFICATION_META[classification].label} <span className="tabular-nums">{count}</span>
              </button>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-[11px] text-muted">
            Urutkan
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value as ClaimOrder)}
              className="rounded-md border border-line bg-surface-raised px-2 py-1 text-[11px] text-foreground focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="document">Sesuai laporan</option>
              <option value="strength">Bukti terkuat dulu</option>
            </select>
          </label>

          <ol className="mt-3 space-y-2" aria-live="polite">
            {shown.map((entry) => (
              <li key={entry.blockId}>
                <a
                  href={`#${reportBlockAnchor(entry.blockId)}`}
                  className={cn(
                    "block rounded-lg border border-l-4 border-line px-3 py-2 transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent",
                    CLASSIFICATION_STRIPE[entry.claim.classification],
                  )}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <ClassificationBadge classification={entry.claim.classification} interactive={false} />
                    <span className="text-[11px] text-muted">{entry.sectionTitle}</span>
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-snug">{entry.claim.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <FileSearch className="size-3" aria-hidden />
                      {entry.evidenceCount > 0 ? `${entry.evidenceCount} bukti` : "tanpa bukti"}
                    </span>
                    {entry.hasProvenance ? (
                      <span className={cn("inline-flex items-center gap-1", RISK_TONES.low.textClass)}>
                        <CircleCheck className="size-3" aria-hidden />
                        provider &amp; waktu ada
                      </span>
                    ) : (
                      <span className={cn("inline-flex items-center gap-1", RISK_TONES.critical.textClass)}>
                        <OctagonAlert className="size-3" aria-hidden />
                        provider/waktu kurang
                      </span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
