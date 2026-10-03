import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MockDataNotice } from "@/components/mock-data-notice";
import { InvestigationHistory } from "@/components/search/investigation-history";
import { GlobalSearch } from "@/components/search/global-search";
import { SearchResults } from "@/components/search/search-results";
import { listInvestigationHistory, listSearchExamples, searchInvestigations, searchPath } from "@/lib/api/search";
import { firstParam } from "@/lib/flow-filter";
import { formatNumber, shortenHash } from "@/lib/format";
import { classifyQuery, QUERY_KIND_LABEL } from "@/lib/search";

export async function generateMetadata({ searchParams }: PageProps<"/cari">): Promise<Metadata> {
  const query = (firstParam((await searchParams).q) ?? "").trim();
  return {
    title: query ? `Cari: ${classifyQuery(query) === "text" ? query : shortenHash(query)}` : "Cari investigasi",
    description: "Cari token, address, atau hash transaksi, lalu lanjutkan investigasi yang pernah dibuka.",
  };
}

function SearchHints() {
  const examples = listSearchExamples();
  return (
    <section aria-labelledby="petunjuk-cari" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 id="petunjuk-cari" className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="size-4 text-accent" aria-hidden />
        Bisa cari apa saja?
      </h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
        <li>Address EVM (0x… 42 karakter) atau address Solana. Huruf besar/kecil address EVM tidak berpengaruh.</li>
        <li>Hash transaksi EVM (0x… 66 karakter) atau signature transaksi Solana. Langsung dibuka beserta buktinya.</li>
        <li>Nama atau simbol token, atau nama label wallet seperti nama exchange.</li>
      </ul>
      <p className="mt-4 text-xs font-medium">Coba contoh:</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {examples.map((example) => (
          <li key={example.query}>
            <Link
              href={searchPath(example.query)}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-3 py-1.5 text-xs ring-1 ring-line transition hover:text-accent hover:ring-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="text-muted">{example.label}:</span>
              <span className={classifyQuery(example.query) === "text" ? "" : "font-mono"}>
                {classifyQuery(example.query) === "text" ? example.query : shortenHash(example.query)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/cari">) {
  const query = (firstParam((await searchParams).q) ?? "").trim();
  const [response, history] = await Promise.all([
    query ? searchInvestigations(query) : Promise.resolve(null),
    listInvestigationHistory(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Cari investigasi</h1>
        <p className="mt-1 text-sm text-muted">
          Tempel address, hash transaksi, atau ketik nama token. Jenis isian dikenali otomatis.
        </p>
      </div>
      <GlobalSearch key={query} variant="page" defaultValue={query} autoFocus={query === ""} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          {response ? (
            <section aria-labelledby="hasil-cari" className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="hasil-cari" className="text-sm font-semibold">
                  {response.results.length > 0 ? `${formatNumber(response.results.length)} hasil` : "Hasil pencarian"}
                </h2>
                <p className="text-xs text-muted">
                  Dikenali sebagai <span className="font-medium text-foreground/90">{QUERY_KIND_LABEL[response.kind]}</span>
                </p>
              </div>
              <SearchResults response={response} />
            </section>
          ) : (
            <SearchHints />
          )}
        </div>
        <InvestigationHistory entries={history} now={new Date()} className="min-w-0 lg:col-span-2" />
      </div>
    </main>
  );
}
