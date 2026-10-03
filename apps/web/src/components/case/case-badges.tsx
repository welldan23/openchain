import { Badge } from "@/components/ui/badge";
import { CASE_DATA_STATUS_META, CASE_STATUS_META } from "@/lib/labels";
import type { CaseDataStatus, CaseStatus } from "@/lib/types";

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const meta = CASE_STATUS_META[status];
  return (
    <Badge className={meta.className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function CaseDataStatusBadge({ status }: { status: CaseDataStatus }) {
  const meta = CASE_DATA_STATUS_META[status];
  return (
    <Badge className={meta.className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}
