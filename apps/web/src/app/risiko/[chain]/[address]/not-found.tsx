import { ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default function RiskNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <EmptyState
        icon={ShieldQuestion}
        title="Objek ini belum dinilai"
        description="Belum ada penilaian risiko untuk address ini di jaringan tersebut. Ini bukan berarti aman; cari address-nya untuk membuka halaman investigasinya."
        action={
          <Link
            href="/cari"
            className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90"
          >
            Cari address
          </Link>
        }
      />
    </main>
  );
}
