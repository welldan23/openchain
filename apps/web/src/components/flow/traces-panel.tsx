import { ChevronRight, Footprints } from "lucide-react";
import Link from "next/link";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { tracePath } from "@/lib/api/traces";
import { addressTitle } from "@/lib/fund-flow";
import type { ChainId, WalletTraceSummary } from "@/lib/types";
import { TraceStartForm } from "./trace-start-form";

/** Jalur dana yang melewati address ini, untuk dibuka langkah demi langkah, plus form telusur ke address lain. */
export function TracesPanel({ traces, chain, address }: { traces: WalletTraceSummary[]; chain: ChainId; address: string }) {
  return (
    <Panel
      id="telusur"
      title="Telusur antar wallet"
      description="Jalur dana yang melewati address ini, bisa dibuka langkah demi langkah."
      icon={Footprints}
      action={<ClassificationBadge classification="heuristic" />}
    >
      <TraceStartForm chain={chain} from={address} />
      {traces.length === 0 ? (
        <EmptyState
          icon={Footprints}
          title="Belum ada jalur tersimpan"
          description="Isi address tujuan di atas untuk mencari jalur dana dari transfer yang sudah dipindai."
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {traces.map((trace) => (
            <li key={`${trace.from}:${trace.to}`}>
              <Link
                href={tracePath(trace.chain, trace.from, trace.to)}
                className="group flex items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5 transition hover:border-accent/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {addressTitle(trace.fromLabel)} → {addressTitle(trace.toLabel)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {trace.hopCount > 0 ? `${trace.hopCount} langkah` : "Tidak ada jalur"}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
