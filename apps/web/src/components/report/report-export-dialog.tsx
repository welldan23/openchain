"use client";

import { Download, Printer, Share2, TriangleAlert, Upload, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/cn";
import { RISK_TONES } from "@/lib/labels";
import { reportIssues } from "@/lib/report";
import { exportFileName, REPORT_EXPORT_FORMATS, reportExportContent, reportToHtml, type ReportExportFormat } from "@/lib/report-export";
import type { InvestigationReport } from "@/lib/types";

function download(content: string, fileName: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Buka versi HTML di tab baru lalu tampilkan dialog cetak; `false` bila tab diblokir browser. */
function printAsPdf(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const tab = window.open(url, "_blank");
  if (!tab) {
    URL.revokeObjectURL(url);
    return false;
  }
  tab.addEventListener("load", () => tab.print(), { once: true });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/**
 * Tombol dan dialog ekspor (HTML, Markdown, JSON, CSV, PDF lewat cetak) dan
 * bagikan tautan. Laporan yang masih punya penghalang hanya bisa diekspor
 * setelah dikonfirmasi sebagai draf; filenya ikut ditandai DRAF.
 */
export function ReportExportDialog({ report }: { report: InvestigationReport }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [format, setFormat] = useState<ReportExportFormat>("html");
  const [confirmDraft, setConfirmDraft] = useState(false);
  const [status, setStatus] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [canShare, setCanShare] = useState(false);
  const blockers = reportIssues(report).filter((issue) => issue.level === "blocker").length;
  const allowed = blockers === 0 || confirmDraft;
  const meta = REPORT_EXPORT_FORMATS.find((item) => item.id === format)!;

  function open() {
    // Dibaca saat dialog dibuka: alamat halaman tanpa fragmen, dan dukungan bagikan bawaan perangkat.
    setShareUrl(window.location.origin + window.location.pathname);
    setCanShare(typeof navigator.share === "function");
    setConfirmDraft(false);
    setStatus("");
    dialogRef.current?.showModal();
  }

  function exportNow() {
    if (!allowed) return;
    const generatedAt = new Date();
    if (format === "pdf") {
      setStatus(
        printAsPdf(reportToHtml(report, generatedAt))
          ? "Versi cetak dibuka di tab baru. Pilih \"Simpan sebagai PDF\" di dialog cetak."
          : "Tab baru diblokir browser. Izinkan pop-up untuk situs ini, atau ekspor sebagai HTML lalu cetak dari sana.",
      );
      return;
    }
    const fileName = exportFileName(report, format, generatedAt);
    download(reportExportContent(report, format, generatedAt), fileName, meta.mime);
    setStatus(`${fileName} diunduh${blockers > 0 ? " sebagai draf" : ""}.`);
  }

  async function share() {
    try {
      await navigator.share({ title: report.title, text: report.summary, url: shareUrl });
    } catch {
      // Dibatalkan pengguna atau tidak didukung; tautan tetap bisa disalin.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Upload className="size-3.5" aria-hidden />
        Ekspor &amp; bagikan
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-0 text-foreground shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold">
              Ekspor &amp; bagikan
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted">{report.title}</p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Tutup ekspor"
            className="inline-grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="space-y-5 p-4 sm:p-5">
          <fieldset>
            <legend className="text-xs font-semibold">Format ekspor</legend>
            <div className="mt-2 space-y-2">
              {REPORT_EXPORT_FORMATS.map((item) => (
                <label
                  key={item.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-3 transition hover:border-accent/50",
                    format === item.id ? "border-accent/60 bg-accent/5" : "border-line",
                  )}
                >
                  <input
                    type="radio"
                    name={`${titleId}-format`}
                    value={item.id}
                    checked={format === item.id}
                    onChange={() => setFormat(item.id)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{item.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {blockers > 0 ? (
            <div className={cn("space-y-2 rounded-lg border px-3 py-2.5 text-xs", RISK_TONES.high.calloutClass)}>
              <p className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Laporan masih punya <strong>{blockers} hal yang perlu dilengkapi</strong>. Klaim tanpa provider, waktu, atau hash bisa menyesatkan
                  pembaca.
                </span>
              </p>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmDraft}
                  onChange={(event) => setConfirmDraft(event.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent)]"
                />
                <span>Tetap ekspor sebagai draf. File diberi tanda DRAF beserta daftar kekurangannya.</span>
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportNow}
              disabled={!allowed}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition enabled:hover:bg-accent/90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {format === "pdf" ? <Printer className="size-3.5" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
              {format === "pdf" ? "Buka versi cetak" : `Unduh ${meta.label}`}
            </button>
            <p role="status" aria-live="polite" className="text-xs text-accent">
              {status}
            </p>
          </div>

          <section aria-labelledby={`${titleId}-bagikan`} className="border-t border-line pt-4">
            <h3 id={`${titleId}-bagikan`} className="text-xs font-semibold">
              Bagikan
            </h3>
            <p className="mt-1 break-all rounded-md bg-surface-raised px-2.5 py-1.5 font-mono text-[11px]">{shareUrl}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton value={shareUrl} label="Salin tautan laporan" variant="labeled" />
              {canShare ? (
                <button
                  type="button"
                  onClick={share}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Share2 className="size-3.5" aria-hidden />
                  Bagikan…
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Tautan ini membuka laporan di workspace ini. Tautan publik untuk orang di luar workspace belum tersedia; kirim file ekspornya
              bila perlu dibagikan ke luar.
            </p>
          </section>
        </div>
      </dialog>
    </>
  );
}
