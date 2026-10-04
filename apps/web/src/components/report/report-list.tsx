import { ChevronRight, FileSearch, FileText, FolderOpen, Layers, Quote } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import { reportPath } from "@/lib/api/reports";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import type { ReportSummary } from "@/lib/types";
import { ReportReadinessBadge, ReportStatusBadge } from "./report-badges";

function Count({ icon: Icon, value, label }: { icon: typeof Layers; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3" aria-hidden />
      <span className="tabular-nums text-foreground/85">{formatNumber(value)}</span> {label}
    </span>
  );
}

/** Daftar laporan sebagai kartu; seluruh kartu bisa diklik lewat tautan judul. */
export function ReportList({ reports, now }: { reports: ReportSummary[]; now: Date }) {
  if (reports.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Belum ada laporan"
        description="Laporan disusun dari kasus yang sudah punya temuan dan bukti transaksi."
        action={
          <Link href="/kasus" className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90">
            Buka daftar kasus
          </Link>
        }
      />
    );
  }
  return (
    <ul className="space-y-3">
      {reports.map((item) => (
        <li
          key={item.id}
          className="group relative rounded-xl border border-line bg-surface p-4 transition focus-within:border-accent/60 hover:border-accent/50 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <ReportStatusBadge status={item.status} />
                <ReportReadinessBadge blockerCount={item.blockerCount} />
              </div>
              <h2 className="mt-2 text-base font-semibold">
                <Link
                  href={reportPath(item.id)}
                  className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
                >
                  {item.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.summary}</p>
              {item.sourceTitle ? (
                <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted">
                  <FolderOpen className="size-3" aria-hidden />
                  Dari kasus: <span className="text-foreground/85">{item.sourceTitle}</span>
                </p>
              ) : null}
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <Count icon={Layers} value={item.sectionCount} label="bagian" />
                <Count icon={Quote} value={item.claimCount} label="klaim" />
                <Count icon={FileSearch} value={item.evidenceCount} label="bukti transaksi" />
                <span>
                  Diperbarui{" "}
                  <time dateTime={item.updatedAt} title={formatDateTime(item.updatedAt)}>
                    {formatRelativeTime(item.updatedAt, now)}
                  </time>
                </span>
              </p>
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
          </div>
        </li>
      ))}
    </ul>
  );
}
