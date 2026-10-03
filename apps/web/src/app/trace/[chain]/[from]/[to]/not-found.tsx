import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default function TraceNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <EmptyState
        icon={SearchX}
        title="Jalur tidak ditemukan"
        description="Pasangan wallet ini belum ada di data. Cek lagi chain dan penulisan kedua address, atau buka salah satu jalur contoh dari beranda."
        action={
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90"
          >
            Kembali ke beranda
          </Link>
        }
      />
    </main>
  );
}
