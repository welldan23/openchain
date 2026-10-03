import { ArrowRight, CircleCheck, CircleDashed, CircleHelp, Spline } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { Badge } from "@/components/ui/badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerTxUrl } from "@/lib/chains";
import { formatAge, formatDateTime, formatPct, formatTokenAmount, formatUsdCompact } from "@/lib/format";
import { BRIDGE_STATUS_META } from "@/lib/labels";
import { bridgeFeePct } from "@/lib/multichain";
import { BridgeEvidenceViewer } from "./bridge-evidence-viewer";
import type { BridgeMatchStatus, BridgeMove } from "@/lib/types";

const STATUS_ICONS: Record<BridgeMatchStatus, LucideIcon> = {
  matched: CircleCheck,
  pending: CircleDashed,
  unmatched: CircleHelp,
};

function BridgeRow({ move, snapshotAt }: { move: BridgeMove; snapshotAt: string }) {
  const status = BRIDGE_STATUS_META[move.status];
  const StatusIcon = STATUS_ICONS[move.status];
  const fee = bridgeFeePct(move.amountSent, move.amountReceived);
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ChainBadge chain={move.fromChain} />
          <ArrowRight className="size-3.5 text-muted" aria-hidden />
          <span className="sr-only">ke</span>
          <ChainBadge chain={move.toChain} />
          <EntityLabelBadge label={move.bridge} />
        </div>
        <Badge className={status.className} title={status.description}>
          <StatusIcon className="size-3" aria-hidden />
          {status.label}
        </Badge>
      </div>
      <p className="text-sm font-medium tabular-nums">
        {formatTokenAmount(move.amountSent, move.asset.symbol, { compact: false, maximumFractionDigits: 6 })}
        <span className="text-xs font-normal text-muted">
          {move.amountUsd !== undefined ? ` · ${formatUsdCompact(move.amountUsd)}` : ""}
          {move.amountReceived !== undefined
            ? ` · diterima ${formatTokenAmount(move.amountReceived, move.asset.symbol, { compact: false, maximumFractionDigits: 6 })}${fee !== null && fee > 0 ? ` (selisih ${formatPct(fee)})` : ""}`
            : ""}
        </span>
      </p>
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[11px] text-muted">Dikirim · {formatDateTime(move.sentAt)}</dt>
          <dd className="mt-0.5">
            <HashLink value={move.sentTxHash} href={explorerTxUrl(move.fromChain, move.sentTxHash)} head={8} tail={4} copyLabel="Salin hash kiriman" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-muted">
            {move.receivedAt
              ? `Diterima · ${formatDateTime(move.receivedAt)} (${formatAge(move.sentAt, move.receivedAt)} kemudian)`
              : "Diterima"}
          </dt>
          <dd className="mt-0.5">
            {move.receivedTxHash ? (
              <HashLink value={move.receivedTxHash} href={explorerTxUrl(move.toChain, move.receivedTxHash)} head={8} tail={4} copyLabel="Salin hash penerimaan" />
            ) : (
              <span className="text-[11px] text-muted">{status.description}</span>
            )}
          </dd>
        </div>
      </dl>
      <BridgeEvidenceViewer move={move} snapshotAt={snapshotAt} />
    </li>
  );
}

/** Perpindahan dana antar chain lewat bridge, beserta hasil pencocokannya. */
export function BridgesPanel({ bridges, snapshotAt }: { bridges: BridgeMove[]; snapshotAt: string }) {
  return (
    <Panel
      id="bridge"
      title="Perpindahan antar chain"
      description="Kiriman ke bridge di chain asal dicocokkan dengan penerimaan di chain tujuan."
      icon={Spline}
      action={<ClassificationBadge classification="heuristic" />}
    >
      {bridges.length === 0 ? (
        <EmptyState
          icon={Spline}
          title="Belum ada perpindahan antar chain"
          description="Tidak ditemukan kiriman lewat bridge dari address ini selama periode data."
        />
      ) : (
        <div className="space-y-4">
          <ol className="divide-y divide-line">
            {[...bridges]
              .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
              .map((move) => (
                <BridgeRow key={move.id} move={move} snapshotAt={snapshotAt} />
              ))}
          </ol>
          <p className="text-[11px] leading-relaxed text-muted">
            Kiriman dan penerimaan masing-masing tercatat di blockchain. Pencocokan keduanya memakai kemiripan jumlah,
            aset, dan waktu, jadi tetap dugaan.
          </p>
        </div>
      )}
    </Panel>
  );
}
