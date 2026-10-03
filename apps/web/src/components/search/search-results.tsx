import { BadgeCheck, ChevronRight, SearchX, ShieldQuestion, SlidersHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ChainBadge, EntityLabelBadge, RiskLevelBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type { SearchResponse } from "@/lib/api/search";
import { MIN_TEXT_QUERY } from "@/lib/api/search";
import { FLOW_DIRECTION_META } from "@/lib/labels";
import { describeResultMeta, normalizeText, QUERY_KIND_LABEL } from "@/lib/search";
import { EMPTY_SEARCH_FILTERS, searchFilterHref, type SearchFilters } from "@/lib/search-filter";
import type { SearchResult, SearchResultMeta } from "@/lib/types";
import { RESULT_GROUPS } from "./kind-meta";

function MetaBadges({ meta }: { meta: SearchResultMeta }) {
  if (meta.kind === "token") {
    return (
      <>
        <RiskLevelBadge level={meta.riskLevel} />
        <Badge title={meta.verified ? "Source code kontrak terverifikasi di explorer" : "Source code kontrak belum terverifikasi"}>
          {meta.verified ? <BadgeCheck className="size-3" aria-hidden /> : <ShieldQuestion className="size-3" aria-hidden />}
          {meta.verified ? "Terverifikasi" : "Belum terverifikasi"}
        </Badge>
      </>
    );
  }
  if (meta.kind === "transaction") {
    const direction = FLOW_DIRECTION_META[meta.direction];
    return <Badge className={direction.className}>{direction.label}</Badge>;
  }
  return null;
}

function ResultRow({ result, icon: Icon, now }: { result: SearchResult; icon: LucideIcon; now: Date }) {
  const meta = result.meta;
  // Address multichain tidak terikat satu chain; tampilkan semua chain aktifnya.
  const chains = result.chain ? [result.chain] : meta?.kind === "address" ? meta.activeChains : [];
  return (
    <li className="group relative rounded-lg border border-line bg-surface px-3 py-3 transition focus-within:border-accent/60 hover:border-accent/50 sm:px-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={result.href}
              className="truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
            >
              {result.title}
            </Link>
            {chains.map((chain) => (
              <ChainBadge key={chain} chain={chain} />
            ))}
            {result.label ? <EntityLabelBadge label={result.label} interactive={false} /> : null}
            {meta ? <MetaBadges meta={meta} /> : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-muted">{result.subtitle}</p>
          {meta ? (
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {describeResultMeta(meta, now).map((item) => (
                <div key={item.id} className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted">{item.label}</dt>
                  <dd className="truncate text-xs font-medium tabular-nums text-foreground/90" title={item.title}>
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="mt-2 text-[11px] text-muted/90">{result.matchedBy}</p>
        </div>
        <ChevronRight className="mt-2.5 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </div>
    </li>
  );
}

function NoResults({ response }: { response: SearchResponse }) {
  const tooShort = response.kind === "text" && normalizeText(response.query).length < MIN_TEXT_QUERY;
  if (tooShort) {
    return (
      <EmptyState
        icon={SearchX}
        title="Isian terlalu pendek"
        description={`Ketik minimal ${MIN_TEXT_QUERY} huruf untuk mencari nama token atau label wallet.`}
      />
    );
  }
  const exact = response.kind !== "text";
  return (
    <EmptyState
      icon={SearchX}
      title="Tidak ada yang cocok"
      description={
        exact ? (
          <>
            {QUERY_KIND_LABEL[response.kind]} ini belum ada di data kami. Pastikan tidak ada karakter yang
            terpotong saat menyalin. Belum ada data bukan berarti aman.
          </>
        ) : (
          <>Coba nama token, simbol, atau nama label lain, atau tempel address/hash transaksi lengkap.</>
        )
      }
    />
  );
}

/** Hasil pencarian beserta ringkasan entitasnya, dikelompokkan per jenis: token, address, transaksi. */
export function SearchResults({
  response,
  results,
  filters,
  now,
}: {
  response: SearchResponse;
  /** Hasil setelah filter. */
  results: SearchResult[];
  filters: SearchFilters;
  now: Date;
}) {
  if (response.results.length === 0) return <NoResults response={response} />;
  if (results.length === 0) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="Tidak ada hasil dengan filter ini"
        description="Longgarkan filter jenis, jaringan, atau label untuk melihat hasil lain."
        action={
          <Link
            href={searchFilterHref(response.query, EMPTY_SEARCH_FILTERS)}
            scroll={false}
            className="inline-flex items-center rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            Hapus semua filter
          </Link>
        }
      />
    );
  }
  const groups = RESULT_GROUPS.filter((group) => filters.kind === "all" || group.kind === filters.kind);
  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const items = results.filter((result) => result.kind === group.kind);
        if (items.length === 0) return null;
        const headingId = `hasil-${group.kind}`;
        return (
          <section key={group.kind} aria-labelledby={headingId}>
            <h3 id={headingId} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {group.title}
              <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] tabular-nums ring-1 ring-line">
                {items.length}
              </span>
            </h3>
            <ul className="mt-2 space-y-2">
              {items.map((result) => (
                <ResultRow key={result.id} result={result} icon={group.icon} now={now} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
