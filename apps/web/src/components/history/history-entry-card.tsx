"use client";

import { ChevronRight, LoaderCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChainBadge } from "@/components/badges";
import { INVESTIGATION_KIND_META } from "@/components/search/kind-meta";
import { deleteInvestigation } from "@/lib/api/search";
import { formatNumber } from "@/lib/format";
import type { InvestigationEntry } from "@/lib/types";
import { NoteEditor } from "./note-editor";

/** Id tautan judul kartu, dipakai untuk memindah fokus setelah item lain dihapus. */
export function entryTitleId(id: string): string {
  return `riwayat-judul-${id}`;
}

interface HistoryEntryCardProps {
  entry: InvestigationEntry;
  onSaved: (entry: InvestigationEntry) => void;
  onDeleted: (entry: InvestigationEntry) => void;
}

/**
 * Satu investigasi di riwayat: judul, jenis, catatan, dan aksi hapus dengan
 * konfirmasi. Item baru hilang dari daftar setelah penghapusan berhasil.
 */
export function HistoryEntryCard({ entry, onSaved, onDeleted }: HistoryEntryCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();
  const trashRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const meta = INVESTIGATION_KIND_META[entry.kind];
  const Icon = meta.icon;
  const confirmId = `${entryTitleId(entry.id)}-konfirmasi`;

  useEffect(() => {
    if (confirming || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    trashRef.current?.focus();
  }, [confirming]);

  function cancel() {
    restoreFocusRef.current = true;
    setConfirming(false);
    setError(null);
  }

  function confirmDelete() {
    setError(null);
    startDeleting(async () => {
      try {
        await deleteInvestigation(entry.id);
        onDeleted(entry);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Item gagal dihapus.");
      }
    });
  }

  return (
    <article className="rounded-lg border border-line bg-surface px-3 py-3 sm:px-4" aria-busy={deleting}>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 text-sm font-medium">
              <Link
                id={entryTitleId(entry.id)}
                href={entry.href}
                className="group inline-flex max-w-full items-center gap-1 rounded hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="truncate">{entry.title}</span>
                <ChevronRight className="size-3.5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </Link>
            </h3>
            <button
              ref={trashRef}
              type="button"
              aria-expanded={confirming}
              aria-controls={confirming ? confirmId : undefined}
              aria-label={`Hapus ${entry.title} dari riwayat`}
              title="Hapus dari riwayat"
              onClick={() => (confirming ? cancel() : setConfirming(true))}
              disabled={deleting}
              className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <span>{meta.label}</span>
            {entry.chain ? <ChainBadge chain={entry.chain} /> : null}
            {entry.findingCount !== undefined ? <span>{formatNumber(entry.findingCount)} temuan</span> : null}
          </p>
          <NoteEditor entry={entry} onSaved={onSaved} />

          {confirming ? (
            <div
              id={confirmId}
              role="group"
              aria-label={`Konfirmasi hapus ${entry.title}`}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !deleting) {
                  event.preventDefault();
                  cancel();
                }
              }}
              className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/5 px-3 py-2.5"
            >
              <p className="text-xs text-foreground/90">
                Hapus dari riwayat?{entry.note ? " Catatannya ikut terhapus." : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">Halaman investigasinya tetap bisa dibuka lagi kapan saja.</p>
              <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={cancel}
                  disabled={deleting}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-60"
                >
                  {deleting ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
                  {deleting ? "Menghapus…" : error ? "Coba hapus lagi" : "Ya, hapus"}
                </button>
              </div>
              {error ? (
                <p role="alert" className="mt-2 text-[11px] text-rose-300">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
