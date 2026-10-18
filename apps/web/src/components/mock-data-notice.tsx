import { FlaskConical } from "lucide-react";
import { isLive } from "@/lib/api/http";

/** Pengingat bahwa halaman memakai data tiruan; tidak tampil saat terhubung ke API sungguhan. */
export function MockDataNotice() {
  if (isLive()) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Halaman ini memakai data tiruan. Token, address, dan hash transaksinya fiktif, jadi tautan
        explorer belum mengarah ke transaksi nyata.
      </span>
    </p>
  );
}
