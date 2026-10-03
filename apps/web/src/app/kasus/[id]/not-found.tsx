import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default function CaseNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <EmptyState
        icon={SearchX}
        title="Kasus tidak ditemukan"
        description="Kasus ini tidak ada atau sudah dihapus. Buka daftar kasus untuk melihat kasus yang tersimpan."
        action={
          <Link
            href="/kasus"
            className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90"
          >
            Lihat daftar kasus
          </Link>
        }
      />
    </main>
  );
}
