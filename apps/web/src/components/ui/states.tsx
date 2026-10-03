import type { LucideIcon } from "lucide-react";
import { Inbox, RotateCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ------------------------------- Loading -------------------------------- */

/**
 * Blok abu-abu berdenyut sebagai placeholder konten yang sedang dimuat.
 * Sudut default `rounded-md` dilewati bila `className` sudah mengatur sudut.
 */
export function Skeleton({ className }: { className?: string }) {
  const hasRadius = className?.includes("rounded") ?? false;
  return (
    <div
      aria-hidden
      className={cn("animate-pulse bg-surface-raised", !hasRadius && "rounded-md", className)}
    />
  );
}

/* -------------------------------- Kosong -------------------------------- */

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Tombol/tautan opsional, mis. "Kembali ke beranda". */
  action?: ReactNode;
  className?: string;
}

/** Tampilan saat data berhasil dimuat tapi isinya kosong. */
export function EmptyState({ title, description, icon: Icon = Inbox, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed border-line px-4 py-8 text-center",
        className,
      )}
    >
      <span className="grid size-10 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
        <Icon className="size-4" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------- Gagal --------------------------------- */

interface ErrorStateProps {
  title: string;
  description?: ReactNode;
  /** Dipanggil saat user menekan "Coba lagi". Tanpa ini tombolnya disembunyikan. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Kode error dari server, ditampilkan agar mudah dilacak di log. */
  digest?: string;
  /** Aksi tambahan, mis. tautan kembali ke beranda. */
  action?: ReactNode;
  className?: string;
}

/** Tampilan saat data gagal dimuat, dengan opsi mencoba lagi. */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Coba lagi",
  digest,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-lg border border-rose-400/25 bg-rose-500/5 px-4 py-8 text-center",
        className,
      )}
    >
      <span className="grid size-10 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
        <TriangleAlert className="size-4" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
      ) : null}
      {onRetry || action ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <RotateCw className="size-3.5" aria-hidden />
              {retryLabel}
            </button>
          ) : null}
          {action}
        </div>
      ) : null}
      {digest ? <p className="mt-3 font-mono text-[10px] text-muted">Kode error: {digest}</p> : null}
    </div>
  );
}
