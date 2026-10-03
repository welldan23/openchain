import { CloudOff, Hourglass } from "lucide-react";
import { RefreshButton } from "@/components/ui/refresh-button";
import { getChain } from "@/lib/chains";
import type { ChainId } from "@/lib/types";

function names(chains: ChainId[]): string {
  return chains.map((chain) => getChain(chain).name).join(", ");
}

/**
 * Peringatan bila ada jaringan yang gagal dimuat atau datanya tertinggal,
 * supaya angka di halaman tidak dibaca sebagai gambaran lengkap.
 */
export function DataStatusBanner({ unavailable, stale }: { unavailable: ChainId[]; stale: ChainId[] }) {
  if (unavailable.length === 0 && stale.length === 0) return null;
  return (
    <section
      role="status"
      aria-label="Status data jaringan"
      className="flex flex-col gap-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-1.5 text-xs text-amber-100">
        {unavailable.length > 0 ? (
          <p className="flex items-start gap-2">
            <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">{names(unavailable)}</strong> gagal dimuat. Aktivitas di sana belum diketahui
              dan tidak ikut dijumlahkan di bawah.
            </span>
          </p>
        ) : null}
        {stale.length > 0 ? (
          <p className="flex items-start gap-2">
            <Hourglass className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Data <strong className="font-semibold">{names(stale)}</strong> tertinggal dari jaringan lain, jadi transaksi
              terbarunya mungkin belum tercatat.
            </span>
          </p>
        ) : null}
      </div>
      <RefreshButton className="self-start sm:self-center" />
    </section>
  );
}
