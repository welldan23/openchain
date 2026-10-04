import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default function ReportNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <EmptyState
        icon={SearchX}
        title="Laporan tidak ditemukan"
        description="Laporan ini tidak ada atau sudah dihapus. Buka daftar laporan untuk melihat yang tersimpan."
        action={
          <Link href="/laporan" className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90">
            Lihat daftar laporan
          </Link>
        }
      />
    </main>
  );
}
