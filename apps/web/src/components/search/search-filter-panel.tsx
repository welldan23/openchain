import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui/panel";
import { getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { ENTITY_LABEL_META } from "@/lib/labels";
import type { ResultKindFilter } from "@/lib/search";
import {
  EMPTY_SEARCH_FILTERS,
  isSearchFiltered,
  searchFilterHref,
  toggleListItem,
  type SearchFacets,
  type SearchFilters,
} from "@/lib/search-filter";
import type { LabelFilterKey, LabelSourceFilter } from "@/lib/wallet-map";

const CHIP =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CHIP_ACTIVE = "bg-accent/15 text-accent ring-accent/40";
const CHIP_IDLE = "bg-surface-raised text-foreground/80 ring-line hover:text-foreground hover:ring-accent/40";
const CHIP_DISABLED = "cursor-not-allowed bg-transparent text-muted/60 ring-line/60";

const KIND_OPTIONS: Array<{ id: ResultKindFilter; label: string }> = [
  { id: "all", label: "Semua" },
  { id: "token", label: "Token" },
  { id: "address", label: "Address" },
  { id: "transaction", label: "Transaksi" },
];

const SOURCE_OPTIONS: Array<{ id: LabelSourceFilter; label: string; title: string }> = [
  { id: "all", label: "Semua sumber", title: "Tampilkan hasil dari sumber label mana pun" },
  { id: "external", label: "Label eksternal", title: "Label dari sumber luar, mis. explorer" },
  { id: "heuristic", label: "Dugaan OpenChain", title: "Label hasil dugaan dari pola transaksi" },
];

function labelName(key: LabelFilterKey): string {
  return key === "none" ? "Tanpa label" : ENTITY_LABEL_META[key].label;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-start">
      <p aria-hidden className="pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Chip tautan; tanpa hasil (dan tidak aktif) jadi teks redup yang tidak bisa diklik. */
function Chip({ href, active, count, children }: { href: string; active: boolean; count?: number; children: ReactNode }) {
  const content = (
    <>
      {children}
      {count !== undefined ? <span className={cn("tabular-nums", active ? "text-accent/80" : "text-muted")}>{count}</span> : null}
    </>
  );
  if (count === 0 && !active) {
    return (
      <span className={cn(CHIP, CHIP_DISABLED)}>
        {content}
        <span className="sr-only"> (tidak ada hasil)</span>
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className={cn(CHIP, active ? CHIP_ACTIVE : CHIP_IDLE)}>
      {content}
    </Link>
  );
}

interface SearchFilterPanelProps {
  query: string;
  filters: SearchFilters;
  facets: SearchFacets;
  shownCount: number;
  totalCount: number;
}

/**
 * Filter jenis hasil, jaringan, dan label. Semua pilihan berupa tautan, jadi
 * tersimpan di URL dan bisa dibagikan. Jaringan dan jenis label bisa dipilih
 * lebih dari satu; kosong berarti semua.
 */
export function SearchFilterPanel({ query, filters, facets, shownCount, totalCount }: SearchFilterPanelProps) {
  const href = (next: Partial<SearchFilters>) => searchFilterHref(query, { ...filters, ...next });
  const hasLabels = facets.labels.some((item) => item.key !== "none");

  return (
    <Panel
      id="filter-cari"
      title="Filter hasil"
      description={`Menampilkan ${shownCount} dari ${totalCount} hasil`}
      icon={SlidersHorizontal}
      action={
        isSearchFiltered(filters) ? (
          <Link
            href={searchFilterHref(query, EMPTY_SEARCH_FILTERS)}
            scroll={false}
            className="inline-flex items-center gap-1 rounded text-xs text-muted underline-offset-2 transition hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="size-3.5" aria-hidden />
            Hapus filter
          </Link>
        ) : null
      }
    >
      <div className="space-y-3">
        <Row label="Jenis">
          {KIND_OPTIONS.map((option) => (
            <Chip key={option.id} href={href({ kind: option.id })} active={filters.kind === option.id} count={facets.kinds[option.id]}>
              {option.label}
            </Chip>
          ))}
        </Row>

        {facets.chains.length > 0 ? (
          <Row label="Jaringan">
            <Chip href={href({ chains: [] })} active={filters.chains.length === 0}>
              Semua
            </Chip>
            {facets.chains.map(({ chain, count }) => (
              <Chip
                key={chain}
                href={href({ chains: toggleListItem(filters.chains, chain) })}
                active={filters.chains.includes(chain)}
                count={count}
              >
                {getChain(chain).name}
              </Chip>
            ))}
          </Row>
        ) : null}

        <Row label="Label">
          <Chip href={href({ labels: [] })} active={filters.labels.length === 0}>
            Semua
          </Chip>
          {facets.labels.map(({ key, count }) => (
            <Chip key={key} href={href({ labels: toggleListItem(filters.labels, key) })} active={filters.labels.includes(key)} count={count}>
              {labelName(key)}
            </Chip>
          ))}
        </Row>

        {hasLabels || filters.source !== "all" ? (
          <Row label="Sumber">
            {SOURCE_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                href={href({ source: option.id })}
                active={filters.source === option.id}
                count={option.id === "all" ? undefined : facets.sources[option.id]}
              >
                <span title={option.title}>{option.label}</span>
              </Chip>
            ))}
          </Row>
        ) : null}
        {filters.source !== "all" ? (
          <p className="text-[11px] leading-relaxed text-muted">
            Memilih sumber hanya menampilkan hasil yang berlabel. Token dan transaksi tidak punya label, jadi ikut tersaring.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
