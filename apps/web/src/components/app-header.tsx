import { Radar, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
            <Radar className="size-4" aria-hidden />
          </span>
          <span>
            OpenChain <span className="hidden text-muted sm:inline">Intelligence</span>
          </span>
        </Link>
        <Form action="/cari" role="search" aria-label="Cari cepat" className="hidden min-w-0 max-w-sm flex-1 md:block">
          <label htmlFor="cari-header" className="sr-only">
            Cari address, hash transaksi, atau token
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="cari-header"
              name="q"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Cari address, hash, atau token"
              className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-xs text-foreground placeholder:text-muted/80 focus:border-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </div>
        </Form>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/cari"
            aria-label="Cari"
            className="grid size-8 place-items-center rounded-lg text-muted ring-1 ring-line transition hover:text-accent hover:ring-accent/50 focus-visible:outline-2 focus-visible:outline-accent md:hidden"
          >
            <Search className="size-4" aria-hidden />
          </Link>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/30">
            Data tiruan
          </span>
        </div>
      </div>
    </header>
  );
}
