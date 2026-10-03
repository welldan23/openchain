import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
        <SearchX className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-semibold">Token tidak ditemukan</h1>
      <p className="mt-2 text-sm text-muted">
        Chain atau address ini belum ada di data. Cek lagi penulisannya, atau buka salah satu token
        contoh dari beranda.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition hover:bg-accent/90"
      >
        Kembali ke beranda
      </Link>
    </main>
  );
}
