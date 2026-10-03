import { ChevronRight, History, NotebookPen } from "lucide-react";
import Link from "next/link";
import { ChainBadge } from "@/components/badges";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import type { InvestigationEntry } from "@/lib/types";
import { INVESTIGATION_KIND_META } from "./kind-meta";

/** Investigasi yang pernah dibuka, terbaru dulu, supaya bisa dilanjutkan. */
export function InvestigationHistory({
  entries,
  now,
  className,
}: {
  entries: InvestigationEntry[];
  now: Date;
  className?: string;
}) {
  return (
    <Panel
      id="riwayat"
      title="Riwayat investigasi"
      description="Halaman yang terakhir kamu buka. Klik untuk melanjutkan."
      icon={History}
      className={className}
      action={
        entries.length > 0 ? (
          <Link
            href="/riwayat"
            className="rounded text-xs text-muted underline-offset-2 transition hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Semua riwayat
          </Link>
        ) : null
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Belum ada riwayat"
          description="Investigasi yang kamu buka akan muncul di sini."
        />
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => {
            const meta = INVESTIGATION_KIND_META[entry.kind];
            const Icon = meta.icon;
            return (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      <span>{meta.label}</span>
                      {entry.chain ? <ChainBadge chain={entry.chain} /> : null}
                      <time dateTime={entry.openedAt} title={formatDateTime(entry.openedAt)}>
                        {formatRelativeTime(entry.openedAt, now)}
                      </time>
                      {entry.findingCount !== undefined ? (
                        <span>{formatNumber(entry.findingCount)} temuan</span>
                      ) : null}
                    </span>
                    {entry.note ? (
                      <span className="mt-1 flex items-start gap-1.5 text-xs text-foreground/80">
                        <NotebookPen className="mt-0.5 size-3 shrink-0 text-muted" aria-hidden />
                        <span>{entry.note}</span>
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="mt-2 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
