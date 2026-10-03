import { ChevronRight, FileSearch, Flag, FolderOpen, NotebookPen, Tag, Target } from "lucide-react";
import Link from "next/link";
import { ChainBadge } from "@/components/badges";
import { EmptyState } from "@/components/ui/states";
import { casePath } from "@/lib/api/cases";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import type { CaseSummary } from "@/lib/types";
import { CaseDataStatusBadge, CaseStatusBadge } from "./case-badges";

function Count({ icon: Icon, value, label }: { icon: typeof Target; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3" aria-hidden />
      <span className="tabular-nums text-foreground/85">{formatNumber(value)}</span> {label}
    </span>
  );
}

/** Daftar kasus sebagai kartu; seluruh kartu bisa diklik lewat tautan judul. */
export function CaseList({ cases, now, filtered }: { cases: CaseSummary[]; now: Date; filtered: boolean }) {
  if (cases.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={filtered ? "Tidak ada kasus di tahap ini" : "Belum ada kasus"}
        description={
          filtered
            ? "Pilih tahap lain di atas untuk melihat kasus lainnya."
            : "Kasus dibuat saat kamu menyimpan investigasi, misalnya dari peta hubungan wallet."
        }
      />
    );
  }
  return (
    <ul className="space-y-3">
      {cases.map((item) => (
        <li
          key={item.id}
          className="group relative rounded-xl border border-line bg-surface p-4 transition focus-within:border-accent/60 hover:border-accent/50 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CaseStatusBadge status={item.status} />
                {item.dataStatus !== "complete" ? <CaseDataStatusBadge status={item.dataStatus} /> : null}
                {item.chains.map((chain) => (
                  <ChainBadge key={chain} chain={chain} />
                ))}
              </div>
              <h2 className="mt-2 text-base font-semibold">
                <Link
                  href={casePath(item.id)}
                  className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
                >
                  {item.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.summary}</p>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <Count icon={Target} value={item.subjectCount} label="subjek" />
                <Count icon={Flag} value={item.findingCount} label="temuan" />
                <Count icon={FileSearch} value={item.evidenceCount} label="bukti transaksi" />
                <Count icon={NotebookPen} value={item.noteCount} label="catatan" />
                <span>
                  Diperbarui{" "}
                  <time dateTime={item.updatedAt} title={formatDateTime(item.updatedAt)}>
                    {formatRelativeTime(item.updatedAt, now)}
                  </time>
                </span>
              </p>
              {item.tags.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tag">
                  {item.tags.map((tag) => (
                    <li key={tag} className="inline-flex items-center gap-1 rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-foreground/80 ring-1 ring-line">
                      <Tag className="size-3 text-muted" aria-hidden />
                      {tag}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
          </div>
        </li>
      ))}
    </ul>
  );
}
