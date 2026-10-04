"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";

export default function ReportsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Tempat lapor ke layanan monitoring nanti; sementara cukup ke console.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <ErrorState
        title="Daftar laporan gagal dimuat"
        description="Layanan laporan sedang tidak bisa dihubungi. Coba lagi sebentar lagi."
        onRetry={retry}
        digest={error.digest}
      />
    </main>
  );
}
