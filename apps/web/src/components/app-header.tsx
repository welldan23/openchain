import { Radar } from "lucide-react";
import Link from "next/link";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
            <Radar className="size-4" aria-hidden />
          </span>
          <span>
            OpenChain <span className="text-muted">Intelligence</span>
          </span>
        </Link>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/30">
          Data tiruan
        </span>
      </div>
    </header>
  );
}
