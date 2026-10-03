"use client";

import { Eye, EyeOff, Highlighter, ListOrdered, Zap } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import { COORDINATION_KIND_META } from "@/lib/labels";
import type { ChainId, CoordinationEvent } from "@/lib/types";
import { describeCoordinationWindow, sortCoordination } from "@/lib/wallet-map";

interface CoordinationPanelProps {
  chain: ChainId;
  events: CoordinationEvent[];
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  showMarkers: boolean;
  onToggleMarkers: () => void;
  /** Tampilkan transaksi pendukung kejadian ini di panel transaksi. */
  onShowTransactions: (id: string) => void;
}

/**
 * Daftar kejadian yang tampak terkoordinasi, terkuat dulu. Tiap kejadian bisa
 * disorot di peta; wallet yang terlibat ditandai ikon petir di gelembungnya.
 */
export function CoordinationPanel({
  chain,
  events,
  focusedId,
  onFocus,
  showMarkers,
  onToggleMarkers,
  onShowTransactions,
}: CoordinationPanelProps) {
  const position = getChain(chain).addressFormat === "solana" ? "slot" : "blok";
  return (
    <Panel
      id="koordinasi"
      title="Deteksi koordinasi"
      description="Wallet yang bergerak serempak. Ditandai ikon petir di peta."
      icon={Zap}
      className="min-w-0"
      action={<ClassificationBadge classification="heuristic" />}
    >
      {events.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Belum ada gerak serempak"
          description="Belum terdeteksi wallet yang bergerak serempak di peta ini. Ini bukan jaminan aman; datanya bisa belum lengkap."
        />
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            aria-pressed={showMarkers}
            onClick={onToggleMarkers}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            {showMarkers ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
            Penanda petir di peta
          </button>
          <ul className="space-y-3">
            {sortCoordination(events).map((event) => {
              const meta = COORDINATION_KIND_META[event.kind];
              const focused = focusedId === event.id;
              return (
                <li key={event.id} className={cn("rounded-lg border p-3 transition", focused ? "border-foreground/40" : "border-line")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold" title={meta.description}>
                      <Zap className="size-3.5 text-foreground/80" aria-hidden />
                      {meta.label}
                    </p>
                    <ConfidenceMeter confidence={event.confidence} />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">{event.detail}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {event.members.length} wallet ·{" "}
                    {event.windowSeconds <= 0 && event.blockNumber !== undefined
                      ? `di ${position} ${formatNumber(event.blockNumber)}`
                      : describeCoordinationWindow(event.windowSeconds, position)}{" "}
                    ·{" "}
                    <time dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                      type="button"
                      aria-pressed={focused}
                      onClick={() => onFocus(focused ? null : event.id)}
                      className="inline-flex items-center gap-1 rounded text-[11px] text-muted underline-offset-2 transition hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Highlighter className="size-3" aria-hidden />
                      {focused ? "Berhenti menyorot" : "Sorot di peta"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onShowTransactions(event.id)}
                      className="inline-flex items-center gap-1 rounded text-[11px] text-muted underline-offset-2 transition hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <ListOrdered className="size-3" aria-hidden />
                      Lihat {event.transactions.length} transaksi pendukung
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
