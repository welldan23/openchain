"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime, formatNumber, formatTime } from "@/lib/format";
import { focusTargetAfterRemoval, groupHistoryByDay, HISTORY_HEADING_ID } from "@/lib/history";
import type { InvestigationEntry } from "@/lib/types";
import { entryTitleId, HistoryEntryCard } from "./history-entry-card";

interface InvestigationTimelineProps {
  entries: InvestigationEntry[];
  /** Waktu acuan (ISO) dari server, supaya label "Hari ini" sama di server dan browser. */
  now: string;
  /** Tombol di kanan judul halaman. */
  action?: ReactNode;
  /** Keterangan di bawah ringkasan, mis. catatan data tiruan. */
  children?: ReactNode;
}

/**
 * Halaman riwayat sisi browser: judul dengan ringkasan yang ikut berubah saat
 * catatan diubah atau item dihapus, lalu linimasanya.
 */
export function InvestigationTimeline({ entries: initial, now, action, children }: InvestigationTimelineProps) {
  const [entries, setEntries] = useState(initial);
  const [status, setStatus] = useState("");
  const focusAfterRemovalRef = useRef<string | null | undefined>(undefined);
  const groups = groupHistoryByDay(entries, new Date(now));

  // Setelah item hilang dari layar, pindahkan fokus ke item terdekat (atau judul halaman).
  useEffect(() => {
    const target = focusAfterRemovalRef.current;
    if (target === undefined) return;
    focusAfterRemovalRef.current = undefined;
    document.getElementById(target === null ? HISTORY_HEADING_ID : entryTitleId(target))?.focus();
  }, [entries]);

  function replace(saved: InvestigationEntry) {
    setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
  }

  function remove(deleted: InvestigationEntry) {
    const order = groups.flatMap((group) => group.entries.map((item) => item.id));
    focusAfterRemovalRef.current = focusTargetAfterRemoval(order, deleted.id);
    setEntries((current) => current.filter((item) => item.id !== deleted.id));
    setStatus(`${deleted.title} dihapus dari riwayat.`);
  }

  const withNotes = entries.filter((entry) => entry.note).length;

  return (
    <div className="space-y-6">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 id={HISTORY_HEADING_ID} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none sm:text-2xl">
              Riwayat investigasi
            </h1>
            <p className="mt-1 text-sm text-muted">
              {formatNumber(entries.length)} investigasi · {formatNumber(withNotes)} dengan catatan. Jam dalam WIB.
            </p>
          </div>
          {action}
        </div>
        {children}
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Belum ada riwayat"
          description="Investigasi yang kamu buka (token, aliran dana, peta, dan lainnya) akan tercatat di sini."
          action={
            <Link
              href="/cari"
              className="inline-flex items-center rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
            >
              Mulai mencari
            </Link>
          }
        />
      ) : (
        groups.map((group) => {
          const headingId = `hari-${group.day}`;
          return (
            <section key={group.day} aria-labelledby={headingId}>
              <h2 id={headingId} className="flex items-baseline gap-2 text-sm font-semibold">
                {group.label}
                <span className="text-xs font-normal text-muted">{group.entries.length} investigasi</span>
              </h2>
              <ol className="mt-3">
                {group.entries.map((entry, index) => {
                  const last = index === group.entries.length - 1;
                  return (
                    <li key={entry.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                      <time
                        dateTime={entry.openedAt}
                        title={formatDateTime(entry.openedAt)}
                        className="pt-3.5 text-right text-[11px] tabular-nums text-muted"
                      >
                        {formatTime(entry.openedAt)}
                      </time>
                      <div className="relative pb-3 pl-5">
                        {/* Garis linimasa */}
                        <span aria-hidden className={`absolute left-[5px] top-0 w-px bg-line ${last ? "h-5" : "bottom-0"}`} />
                        <span aria-hidden className="absolute left-0 top-4 size-[11px] rounded-full border-2 border-line bg-background" />
                        <HistoryEntryCard entry={entry} onSaved={replace} onDeleted={remove} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })
      )}
    </div>
  );
}
