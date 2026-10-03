import { CalendarX2, Inbox } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import type { FlowEmptyKind } from "@/lib/flow-filter";

interface FlowEmptyStateProps {
  kind: FlowEmptyKind;
  /** Jumlah transfer tanpa filter, untuk menyebut berapa yang tersembunyi. */
  totalCount: number;
  /** Tautan halaman yang sama tanpa filter waktu. */
  resetHref: string;
  className?: string;
}

/**
 * State kosong halaman aliran dana. Address yang memang belum punya transfer
 * dibedakan dari hasil filter yang kosong; yang kedua diberi jalan pintas
 * untuk membuang filter.
 */
export function FlowEmptyState({ kind, totalCount, resetHref, className }: FlowEmptyStateProps) {
  if (kind === "no-data") {
    return (
      <EmptyState
        icon={Inbox}
        className={className}
        title="Address ini belum punya transfer"
        description="Belum ada dana masuk atau keluar yang terindeks selama periode data. Bisa jadi wallet-nya baru, atau belum aktif di chain ini."
      />
    );
  }
  return (
    <EmptyState
      icon={CalendarX2}
      className={className}
      title="Tidak ada transfer di rentang ini"
      description={`${totalCount} transfer ada di luar rentang waktu yang dipilih.`}
      action={
        <Link
          href={resetHref}
          className="inline-flex items-center rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
        >
          Tampilkan semua transfer
        </Link>
      }
    />
  );
}
