"use client";

import { CircleDot } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EvidenceProvider } from "@/components/evidence/evidence-dialog";
import { reportBlockAnchor, reportIssues } from "@/lib/report";
import { shortenHash } from "@/lib/format";
import { embedEvidence, type ReportEvidenceEntry } from "@/lib/report-evidence";
import { addPickedItems } from "@/lib/report-picker";
import type { InvestigationCase, InvestigationReport } from "@/lib/types";
import { ReportEvidencePanel } from "./report-evidence-panel";
import { ReportExportDialog } from "./report-export-dialog";
import { ReportFindingsIndex } from "./report-findings-index";
import { ReportPicker, type PickerSelection } from "./report-picker";
import { ReportDocument, ReportHeader, ReportOutline, ReportReadinessPanel, ReportSnapshotPanel } from "./report-workspace";

/** Berapa lama blok baru disorot setelah ditambahkan. */
const HIGHLIGHT_MS = 4_000;

/**
 * Workspace laporan yang bisa diubah: isi laporan dipegang di sini, jadi
 * daftar isi, kesiapan, dan dokumen ikut berubah saat item ditambahkan.
 * Selama fase frontend perubahan belum disimpan ke server.
 */
export function ReportEditor({
  initialReport,
  source,
  nowIso,
}: {
  initialReport: InvestigationReport;
  /** Kasus sumber; `null` bila laporan tidak berasal dari kasus atau kasusnya tidak ada. */
  source: InvestigationCase | null;
  /** Waktu render server, supaya "x jam lalu" sama di server dan browser. */
  nowIso: string;
}) {
  const [report, setReport] = useState(initialReport);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState("");
  const issues = useMemo(() => reportIssues(report), [report]);
  const changed = report !== initialReport;

  useEffect(() => {
    if (highlighted.size === 0) return;
    const [first] = highlighted;
    document.getElementById(reportBlockAnchor(first))?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlighted(new Set()), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  function add(selection: PickerSelection) {
    if (!source) return;
    const result = addPickedItems(report, source, selection, new Date().toISOString());
    setReport(result.report);
    setHighlighted(new Set(result.addedBlockIds));
    const parts = [
      result.addedSubjects > 0 ? `${result.addedSubjects} entitas` : null,
      result.addedFindings > 0 ? `${result.addedFindings} temuan` : null,
    ].filter(Boolean);
    setMessage(parts.length > 0 ? `${parts.join(" dan ")} ditambahkan ke laporan.` : "Semua pilihan sudah ada di laporan.");
  }

  function embed(entry: ReportEvidenceEntry) {
    const result = embedEvidence(report, entry, new Date().toISOString());
    if (!result.blockId || result.report === report) return;
    setReport(result.report);
    setHighlighted(new Set([result.blockId]));
    setMessage(`Bukti ${shortenHash(entry.txHash)} disematkan ke bagian Bukti utama.`);
  }

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <ReportExportDialog report={report} />
        {source ? (
          <ReportPicker report={report} source={source} onAdd={add} />
        ) : (
          <p className="text-xs text-muted">Laporan ini tidak punya kasus sumber, jadi belum ada entitas atau temuan untuk dipilih.</p>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        {changed ? (
          <>
            <CircleDot className="size-3 text-accent" aria-hidden />
            Ada perubahan yang belum disimpan (data tiruan)
          </>
        ) : (
          "Belum ada perubahan"
        )}
      </p>
      <p role="status" aria-live="polite" className="w-full text-xs text-accent empty:hidden">
        {message}
      </p>
    </div>
  );

  return (
    <>
      <ReportHeader report={report} issues={issues} now={new Date(nowIso)} />
      <EvidenceProvider evidence={report.evidence}>
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[14rem_minmax(0,1fr)_20rem]">
          <ReportOutline report={report} issues={issues} />
          <div className="min-w-0">
            <ReportDocument report={report} issues={issues} highlighted={highlighted} toolbar={toolbar} />
            <div className="mt-5">
              <ReportEvidencePanel report={report} onEmbed={embed} />
            </div>
          </div>
          <div className="min-w-0 space-y-5">
            <ReportReadinessPanel issues={issues} />
            <ReportFindingsIndex report={report} />
            <ReportSnapshotPanel report={report} />
          </div>
        </div>
      </EvidenceProvider>
    </>
  );
}
