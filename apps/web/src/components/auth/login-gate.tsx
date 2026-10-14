import { LockKeyhole, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { authHref } from "@/lib/return-to";

/** Alamat halaman ini (path, query, anchor), dibaca saat dibutuhkan di browser. */
export function currentLocation(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Ajakan masuk sebelum menyimpan investigasi. Setelah masuk atau daftar,
 * pengguna dikembalikan ke `returnTo`.
 */
export function LoginGate({ action, returnTo, className }: { action: string; returnTo: string | null; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
          <LockKeyhole className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Masuk dulu untuk {action}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Investigasi disimpan di akunmu supaya bisa dibuka lagi dengan snapshot data yang sama. Setelah masuk, kamu kembali ke halaman ini.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Link
          href={authHref("/daftar", returnTo)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground ring-1 ring-inset ring-line transition hover:ring-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <UserPlus className="size-3.5" aria-hidden />
          Daftar
        </Link>
        <Link
          href={authHref("/masuk", returnTo)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <LogIn className="size-3.5" aria-hidden />
          Masuk
        </Link>
      </div>
    </div>
  );
}
