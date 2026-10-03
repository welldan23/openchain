import { FolderOpen, History, Radar, Search } from "lucide-react";
import Link from "next/link";
import { HeaderSearch } from "./search/header-search";

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
        <div className="hidden min-w-0 max-w-sm flex-1 md:block">
          <HeaderSearch />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/kasus"
            aria-label="Kasus investigasi"
            title="Kasus investigasi"
            className="grid size-8 place-items-center rounded-lg text-muted ring-1 ring-line transition hover:text-accent hover:ring-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <FolderOpen className="size-4" aria-hidden />
          </Link>
          <Link
            href="/riwayat"
            aria-label="Riwayat investigasi"
            title="Riwayat investigasi"
            className="grid size-8 place-items-center rounded-lg text-muted ring-1 ring-line transition hover:text-accent hover:ring-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <History className="size-4" aria-hidden />
          </Link>
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
