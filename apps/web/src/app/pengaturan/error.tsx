"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";

export default function SettingsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Tempat lapor ke layanan monitoring nanti; sementara cukup ke console.
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="Pengaturan gagal dimuat"
      description="Layanan pengaturan sedang tidak bisa dihubungi. Coba lagi sebentar lagi."
      onRetry={retry}
      digest={error.digest}
    />
  );
}
