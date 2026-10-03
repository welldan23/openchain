import { ChevronRight, Footprints } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { tracePath } from "@/lib/api/traces";
import { addressTitle } from "@/lib/fund-flow";
import type { WalletTraceSummary } from "@/lib/types";

/** Jalur dana yang melewati address ini, untuk dibuka langkah demi langkah. */
export function TracesPanel({ traces }: { traces: WalletTraceSummary[] }) {
  return (
    <Panel
      id="telusur"
      title="Telusur antar wallet"
      description="Jalur dana yang melewati address ini, bisa dibuka langkah demi langkah."
      icon={Footprints}
    >
      {traces.length === 0 ? (
        <p className="text-xs text-muted">Belum ada jalur tersimpan yang melewati address ini.</p>
      ) : (
        <ul className="space-y-2">
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
