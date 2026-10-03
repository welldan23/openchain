import { ArrowLeftRight, ChevronRight, Coins, SearchX, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { EmptyState } from "@/components/ui/states";
import type { SearchResponse } from "@/lib/api/search";
import { MIN_TEXT_QUERY } from "@/lib/api/search";
import { normalizeText, QUERY_KIND_LABEL } from "@/lib/search";
import type { SearchResult, SearchResultKind } from "@/lib/types";

const GROUPS: Array<{ kind: SearchResultKind; title: string; icon: LucideIcon }> = [
  { kind: "token", title: "Token", icon: Coins },
  { kind: "address", title: "Address", icon: Wallet },
  { kind: "transaction", title: "Transaksi", icon: ArrowLeftRight },
];

function ResultRow({ result, icon: Icon }: { result: SearchResult; icon: LucideIcon }) {
  return (
    <li>
      <Link
        href={result.href}
        className="group flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3 transition hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-4"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium">{result.title}</span>
            {result.chain ? <ChainBadge chain={result.chain} /> : null}
            {result.label ? <EntityLabelBadge label={result.label} interactive={false} /> : null}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-muted">{result.subtitle}</span>
          <span className="mt-0.5 block text-[11px] text-muted/90">{result.matchedBy}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </Link>
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

/** Hasil pencarian, dikelompokkan per jenis: token, address, transaksi. */
export function SearchResults({ response }: { response: SearchResponse }) {
  if (response.results.length === 0) return <NoResults response={response} />;
  return (
    <div className="space-y-6">
      {GROUPS.map((group) => {
        const items = response.results.filter((result) => result.kind === group.kind);
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
                <ResultRow key={result.id} result={result} icon={group.icon} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
