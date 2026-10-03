import { FlaskConical } from "lucide-react";

/** Pengingat bahwa halaman masih memakai data tiruan selama fase frontend. */
export function MockDataNotice() {
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
