"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";

export default function CaseError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Tempat lapor ke layanan monitoring nanti; sementara cukup ke console.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <ErrorState
        title="Kasus gagal dimuat"
        description="Layanan kasus sedang tidak bisa dihubungi. Isi kasus tidak kami tebak; coba lagi sebentar lagi."
        onRetry={retry}
        digest={error.digest}
        action={
          <Link
            href="/kasus"
            className="inline-flex items-center rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            Kembali ke daftar kasus
          </Link>
        }
      />
    </main>
  );
}
