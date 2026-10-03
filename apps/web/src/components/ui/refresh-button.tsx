"use client";

import { LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

/** Muat ulang data halaman dari server tanpa memuat ulang seluruh halaman. */
export function RefreshButton({ label = "Muat ulang", className }: { label?: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-80",
        className,
      )}
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RotateCw className="size-3.5" aria-hidden />}
      {pending ? "Memuat ulang…" : label}
    </button>
  );
}
