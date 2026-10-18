import { TriangleAlert } from "lucide-react";
import { CASE_DATA_STATUS_META } from "@/lib/labels";
import type { CaseDataStatus } from "@/lib/types";

/**
 * Pemberitahuan bila data halaman tidak lengkap, tertinggal, atau tidak
 * tersedia; alasannya (mis. provider yang gagal) ditampilkan apa adanya.
 */
export function DataStatusNotice({ dataStatus, statusReason }: { dataStatus?: CaseDataStatus; statusReason?: string }) {
  if (!dataStatus || dataStatus === "complete") return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">{CASE_DATA_STATUS_META[dataStatus].label}.</strong> {statusReason ?? CASE_DATA_STATUS_META[dataStatus].description}
      </span>
    </p>
  );
}
