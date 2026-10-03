import { X } from "lucide-react";
import Link from "next/link";
import { activeFilterChips, searchFilterHref, type SearchFilters } from "@/lib/search-filter";

/**
 * Ringkasan filter yang sedang aktif. Tiap chip membuang satu pilihan saja,
 * jadi filter lain tetap berlaku; "Hapus filter" ada di kepala panel filter.
 */
export function ActiveFilterChips({ query, filters }: { query: string; filters: SearchFilters }) {
  const chips = activeFilterChips(filters);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="region" aria-label="Filter aktif">
      <span className="mr-0.5 text-[11px] text-muted">Filter aktif:</span>
      <ul className="contents">
        {chips.map((chip) => (
          <li key={chip.id}>
            <Link
              href={searchFilterHref(query, chip.without)}
              scroll={false}
              aria-label={`Hapus filter ${chip.group.toLowerCase()} ${chip.value}`}
              className="group inline-flex items-center gap-1 rounded-full bg-accent/10 py-1 pl-2.5 pr-1.5 text-xs ring-1 ring-inset ring-accent/30 transition hover:bg-accent/15 hover:ring-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="text-muted">{chip.group}:</span>
              <span className="font-medium text-foreground">{chip.value}</span>
              <X className="size-3.5 text-muted transition group-hover:text-accent" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
