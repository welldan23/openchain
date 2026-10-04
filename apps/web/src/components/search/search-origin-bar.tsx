"use client";

import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { searchPath } from "@/lib/api/search";
import { SEARCH_ORIGIN_PARAM } from "@/lib/search";

/**
 * Bar tipis di bawah header saat halaman investigasi dibuka dari pencarian
 * (`?cari=`): satu klik kembali ke hasil yang sama.
 */
export function SearchOriginBar() {
  const pathname = usePathname();
  const query = useSearchParams().get(SEARCH_ORIGIN_PARAM)?.trim() ?? "";
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!query || pathname === "/cari" || dismissed === `${pathname}?${query}`) return null;
  return (
    <div className="border-b border-line bg-surface/70">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6 lg:px-8">
        <Link
          href={searchPath(query)}
          className="inline-flex min-w-0 items-center gap-1.5 rounded text-xs text-muted transition hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeft className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Kembali ke hasil pencarian <span className="font-medium text-foreground/90">“{query}”</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(`${pathname}?${query}`)}
          aria-label="Sembunyikan tautan kembali ke pencarian"
          className="grid size-6 shrink-0 place-items-center rounded text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
