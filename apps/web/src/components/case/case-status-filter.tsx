import Link from "next/link";
import { cn } from "@/lib/cn";
import type { CaseStatusFilter } from "@/lib/cases";
import { CASE_STATUS_META } from "@/lib/labels";

const OPTIONS: Array<{ id: CaseStatusFilter; label: string }> = [
  { id: "all", label: "Semua" },
  { id: "open", label: CASE_STATUS_META.open.label },
  { id: "monitoring", label: CASE_STATUS_META.monitoring.label },
  { id: "closed", label: CASE_STATUS_META.closed.label },
];

export function caseListHref(filter: CaseStatusFilter): string {
  return filter === "all" ? "/kasus" : `/kasus?tahap=${filter}`;
}

/** Tab tahap kasus (?tahap=), dengan jumlah kasus di tiap tahap. */
export function CaseStatusFilterTabs({ current, counts }: { current: CaseStatusFilter; counts: Record<CaseStatusFilter, number> }) {
  return (
    <nav aria-label="Saring tahap kasus" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex gap-1.5">
        {OPTIONS.map((option) => {
          const active = option.id === current;
          return (
            <li key={option.id}>
              <Link
                href={caseListHref(option.id)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active ? "bg-accent/15 text-accent ring-accent/40" : "bg-surface-raised text-foreground/80 ring-line hover:text-foreground hover:ring-accent/40",
                )}
              >
                {option.label}
                <span className={cn("tabular-nums", active ? "text-accent/80" : "text-muted")}>{counts[option.id]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
