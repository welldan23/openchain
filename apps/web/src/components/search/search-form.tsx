import { Search } from "lucide-react";
import Form from "next/form";

/**
 * Kotak cari utama di halaman /cari. Memakai GET biasa (`?q=`), jadi hasil
 * pencarian bisa dibagikan lewat URL dan tetap jalan tanpa JavaScript.
 */
export function SearchForm({ query }: { query: string }) {
  return (
    <Form action="/cari" role="search" aria-label="Cari investigasi" className="flex gap-2">
      <label htmlFor="cari-q" className="sr-only">
        Address, hash transaksi, atau nama token
      </label>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          key={query}
          id="cari-q"
          name="q"
          type="search"
          defaultValue={query}
          autoFocus={query === ""}
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…, address Solana, hash transaksi, atau nama token"
          className="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted/80 focus:border-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>
      <button
        type="submit"
        className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Cari
      </button>
    </Form>
  );
}
