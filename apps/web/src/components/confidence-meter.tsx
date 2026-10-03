import { cn } from "@/lib/cn";
import { CLUSTER_CONFIDENCE_META } from "@/lib/labels";
import type { ClusterConfidence } from "@/lib/types";

/** Tiga balok kecil; jumlah yang terisi menunjukkan tingkat keyakinan. */
export function ConfidenceMeter({ confidence }: { confidence: ClusterConfidence }) {
  const meta = CLUSTER_CONFIDENCE_META[confidence];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span aria-hidden className="inline-flex gap-0.5">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={cn("h-2.5 w-1.5 rounded-sm", step <= meta.level ? "bg-foreground/80" : "bg-surface-raised ring-1 ring-line")}
          />
        ))}
      </span>
      {meta.label}
    </span>
  );
}
