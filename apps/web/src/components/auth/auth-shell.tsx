import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

/** Bingkai halaman masuk/daftar, dengan pengingat bahwa akun tidak pernah meminta akses wallet. */
export function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-8 sm:py-12">
      <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        Simulasi: belum ada akun sungguhan. Data yang diisi tidak dikirim atau disimpan ke mana pun.
      </p>
      <section aria-labelledby="judul-akun" className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <h1 id="judul-akun" className="text-xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <div className="mt-5">{children}</div>
      </section>
      <p className="flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          OpenChain hanya membaca data on-chain. Kami tidak pernah meminta seed phrase, private key, tanda tangan, atau koneksi wallet.
        </span>
      </p>
      <div className="text-center text-sm text-muted">{footer}</div>
    </main>
  );
}
