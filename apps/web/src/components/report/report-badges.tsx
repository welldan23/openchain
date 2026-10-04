import { CircleCheck, OctagonAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { REPORT_STATUS_META, RISK_TONES } from "@/lib/labels";
import type { ReportStatus } from "@/lib/types";

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const meta = REPORT_STATUS_META[status];
  return (
    <Badge className={meta.className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

/** Kesiapan laporan: jumlah penghalang, atau siap bila tidak ada. */
export function ReportReadinessBadge({ blockerCount }: { blockerCount: number }) {
  return blockerCount === 0 ? (
    <Badge className={RISK_TONES.low.className} title="Semua klaim punya provider, waktu, dan bukti yang dibutuhkan">
      <CircleCheck className="size-3 shrink-0" aria-hidden />
      Siap dibagikan
    </Badge>
  ) : (
    <Badge className={RISK_TONES.critical.className} title="Ada klaim yang belum punya provider, waktu, atau hash bukti">
      <OctagonAlert className="size-3 shrink-0" aria-hidden />
      {blockerCount} perlu dilengkapi
    </Badge>
  );
}
