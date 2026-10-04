"use client";

import { ChevronLeft, ChevronRight, ExternalLink, FileSearch, ListChecks, PanelRightOpen, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SeverityBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceMovements } from "@/components/evidence/evidence-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { explorerTxUrl, getChain } from "@/lib/chains";
import { formatDateTime } from "@/lib/format";
import { DANGER_STATUS_META, DANGER_TRAIT_META } from "@/lib/labels";
import { parseReasonDrawerAnchor, reasonDetail, reasonDrawerAnchor, type ReasonDetail } from "@/lib/risk";
import type { ObjectRisk } from "@/lib/types";

interface ReasonDrawerContextValue {
  open: (reasonId: string) => void;
}

const ReasonDrawerContext = createContext<ReasonDrawerContextValue | null>(null);

function clearAnchor() {
  if (parseReasonDrawerAnchor(window.location.hash)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

/**
 * Laci samping berisi rincian satu alasan penilaian dan semua hash buktinya.
 * Terbuka dari `ReasonDrawerTrigger` atau dari tautan `#detail-alasan-<id>`.
 */
export function ReasonDrawerProvider({ risk, children }: { risk: ObjectRisk; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const detail = useMemo(() => (activeId ? reasonDetail(risk, activeId) : null), [risk, activeId]);

  const open = useCallback(
    (reasonId: string) => {
      if (!risk.reasons.some((reason) => reason.id === reasonId)) return;
      history.replaceState(null, "", `#${reasonDrawerAnchor(reasonId)}`);
      setShareUrl(window.location.href);
      setActiveId(reasonId);
    },
    [risk.reasons],
  );

  useEffect(() => {
    function fromLocation() {
      const reasonId = parseReasonDrawerAnchor(window.location.hash);
      if (reasonId) open(reasonId);
    }
    fromLocation();
    window.addEventListener("hashchange", fromLocation);
    return () => window.removeEventListener("hashchange", fromLocation);
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (detail && !dialog.open) dialog.showModal();
    if (!detail && dialog.open) dialog.close();
  }, [detail]);

  const contextValue = useMemo(() => ({ open }), [open]);

  return (
    <ReasonDrawerContext.Provider value={contextValue}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="laci-alasan-title"
        onClose={() => {
          setActiveId(null);
          clearAnchor();
        }}
        onClick={(event) => {
          // Klik di latar gelap menutup laci.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-md overflow-y-auto border-l border-line bg-surface p-0 text-foreground shadow-2xl shadow-black/60 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        {detail ? (
          <ReasonBody
            risk={risk}
            detail={detail}
            shareUrl={shareUrl}
            onNavigate={open}
            onClose={() => dialogRef.current?.close()}
          />
        ) : null}
      </dialog>
    </ReasonDrawerContext.Provider>
  );
}

/** Tombol pembuka laci untuk satu alasan. Di luar penyedia laci tidak ditampilkan. */
export function ReasonDrawerTrigger({ reasonId, evidenceCount }: { reasonId: string; evidenceCount: number }) {
  const context = useContext(ReasonDrawerContext);
  if (!context) return null;
  return (
    <button
      type="button"
      onClick={() => context.open(reasonId)}
      aria-haspopup="dialog"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      <PanelRightOpen className="size-3.5" aria-hidden />
      {evidenceCount > 0 ? `Lihat alasan & ${evidenceCount} bukti` : "Lihat rincian alasan"}
    </button>
  );
}

function ReasonBody({
  risk,
  detail,
  shareUrl,
  onNavigate,
  onClose,
}: {
  risk: ObjectRisk;
  detail: ReasonDetail;
  shareUrl: string;
  onNavigate: (reasonId: string) => void;
  onClose: () => void;
}) {
  const { reason } = detail;
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-raised text-accent ring-1 ring-line">
            <ListChecks className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-muted">Alasan penilaian</p>
            <h2 id="laci-alasan-title" className="text-sm font-semibold leading-snug">
              {reason.title}
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup rincian alasan"
          className="inline-grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={reason.severity} />
          <ClassificationBadge classification={reason.classification} />
        </div>

        <section aria-labelledby="laci-skor">
          <h3 id="laci-skor" className="text-[11px] text-muted">
            Sumbangan ke skor
          </h3>
          {reason.points === null ? (
            <p className="mt-1 text-sm">Tidak ikut dihitung, karena alasan ini belum didukung bukti on-chain.</p>
          ) : (
            <p className="mt-1 text-sm">
              <span className="font-mono font-semibold tabular-nums">+{reason.points} poin</span>
              {detail.scoreSharePct !== null ? (
                <span className="text-muted">
                  {" "}
                  dari skor {risk.score} ({detail.scoreSharePct}%)
                </span>
              ) : null}
            </p>
          )}
        </section>

        <section aria-labelledby="laci-kenapa">
          <h3 id="laci-kenapa" className="text-[11px] text-muted">
            Kenapa ini berisiko
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{reason.description}</p>
        </section>

        {detail.traits.length > 0 ? (
          <section aria-labelledby="laci-ciri">
            <h3 id="laci-ciri" className="text-[11px] text-muted">
              Ciri berbahaya terkait
            </h3>
            <ul className="mt-1 space-y-1">
              {detail.traits.map((check) => (
                <li key={check.trait} className="text-xs">
                  <span className="font-medium">{DANGER_TRAIT_META[check.trait].label}</span>{" "}
                  <span className={DANGER_STATUS_META[check.status].className}>· {DANGER_STATUS_META[check.status].label}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="laci-bukti">
          <h3 id="laci-bukti" className="text-[11px] text-muted">
            Bukti transaksi ({detail.evidence.length})
          </h3>
          {detail.evidence.length === 0 ? (
            <p className="mt-1 rounded-lg border border-dashed border-line px-3 py-2.5 text-xs leading-relaxed text-muted">
              Alasan ini belum punya bukti transaksi. Anggap sebagai klaim sampai ada transaksi yang membuktikannya.
            </p>
          ) : (
            <ol className="mt-2 space-y-3">
              {detail.evidence.map(({ txHash, detail: tx }) => {
                const chain = tx?.chain ?? risk.chain;
                return (
                  <li key={txHash} className="space-y-2 rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                        <FileSearch className="size-3.5" aria-hidden />
                        {getChain(chain).name}
                        {tx ? (
                          <>
                            {" · "}
                            <time dateTime={tx.timestamp}>{formatDateTime(tx.timestamp)}</time>
                          </>
                        ) : null}
                      </span>
                      <ClassificationBadge classification={tx ? "fact" : "unavailable"} />
                    </div>
                    <p className="break-all rounded-md bg-surface-raised px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">{txHash}</p>
                    {tx ? (
                      <EvidenceMovements evidence={tx} />
                    ) : (
                      <p className="text-xs leading-relaxed text-muted">
                        Rincian perpindahan transaksi ini belum ada di data tersimpan. Buka di explorer untuk melihat isinya.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <CopyButton value={txHash} label="Salin hash" variant="labeled" />
                      <a
                        href={explorerTxUrl(chain, txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        Buka di {getChain(chain).explorer.name}
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3 sm:px-5">
        <CopyButton value={shareUrl} label="Salin tautan alasan" variant="labeled" />
        <nav aria-label="Alasan lain" className="flex gap-1">
          <button
            type="button"
            disabled={!detail.previousId}
            onClick={() => detail.previousId && onNavigate(detail.previousId)}
            aria-label="Alasan sebelumnya"
            className="inline-grid size-8 place-items-center rounded-lg border border-line text-muted transition enabled:hover:border-accent/60 enabled:hover:text-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={!detail.nextId}
            onClick={() => detail.nextId && onNavigate(detail.nextId)}
            aria-label="Alasan berikutnya"
            className="inline-grid size-8 place-items-center rounded-lg border border-line text-muted transition enabled:hover:border-accent/60 enabled:hover:text-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </nav>
      </footer>
    </div>
  );
}
