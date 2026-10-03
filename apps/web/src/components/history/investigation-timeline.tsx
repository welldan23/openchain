"use client";

import { ChevronRight, History } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChainBadge } from "@/components/badges";
import { INVESTIGATION_KIND_META } from "@/components/search/kind-meta";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime, formatNumber, formatTime } from "@/lib/format";
import { groupHistoryByDay } from "@/lib/history";
import type { InvestigationEntry } from "@/lib/types";
import { NoteEditor } from "./note-editor";

interface InvestigationTimelineProps {
  entries: InvestigationEntry[];
  /** Waktu acuan (ISO) dari server, supaya label "Hari ini" sama di server dan browser. */
  now: string;
}

/** Riwayat investigasi per hari, lengkap dengan jam dibuka dan catatan yang bisa diubah. */
export function InvestigationTimeline({ entries: initial, now }: InvestigationTimelineProps) {
  const [entries, setEntries] = useState(initial);
  if (entries.length === 0) {
    return (
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
    );
  }

  function replace(saved: InvestigationEntry) {
    setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
  }

  return (
    <div className="space-y-6">
      {groupHistoryByDay(entries, new Date(now)).map((group) => {
        const headingId = `hari-${group.day}`;
        return (
          <section key={group.day} aria-labelledby={headingId}>
            <h2 id={headingId} className="flex items-baseline gap-2 text-sm font-semibold">
              {group.label}
              <span className="text-xs font-normal text-muted">{group.entries.length} investigasi</span>
            </h2>
            <ol className="mt-3 space-y-0">
              {group.entries.map((entry, index) => {
                const meta = INVESTIGATION_KIND_META[entry.kind];
                const Icon = meta.icon;
                const last = index === group.entries.length - 1;
                return (
                  <li key={entry.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                    <time dateTime={entry.openedAt} title={formatDateTime(entry.openedAt)} className="pt-3.5 text-right text-[11px] tabular-nums text-muted">
                      {formatTime(entry.openedAt)}
                    </time>
                    <div className="relative pb-3 pl-5">
                      {/* Garis linimasa */}
                      <span aria-hidden className={`absolute left-[5px] top-0 w-px bg-line ${last ? "h-5" : "bottom-0"}`} />
                      <span aria-hidden className="absolute left-0 top-4 size-[11px] rounded-full border-2 border-line bg-background" />
                      <article className="rounded-lg border border-line bg-surface px-3 py-3 sm:px-4">
                        <div className="flex items-start gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
                            <Icon className="size-3.5" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-medium">
                              <Link
                                href={entry.href}
                                className="group inline-flex max-w-full items-center gap-1 rounded hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                              >
                                <span className="truncate">{entry.title}</span>
                                <ChevronRight className="size-3.5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                              </Link>
                            </h3>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                              <span>{meta.label}</span>
                              {entry.chain ? <ChainBadge chain={entry.chain} /> : null}
                              {entry.findingCount !== undefined ? <span>{formatNumber(entry.findingCount)} temuan</span> : null}
                            </p>
                            <NoteEditor entry={entry} onSaved={replace} />
                          </div>
                        </div>
                      </article>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
