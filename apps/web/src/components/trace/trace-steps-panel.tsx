import { Footprints, Route, TriangleAlert } from "lucide-react";
import { EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceProvider, EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerAddressUrl } from "@/lib/chains";
import { evidenceFromHops } from "@/lib/evidence";
import { formatDateTime, formatTokenAmount, formatUsdCompact } from "@/lib/format";
import { addressTitle } from "@/lib/fund-flow";
import type { ChainId, EntityLabel, WalletTrace } from "@/lib/types";
import { traceSteps, type TraceSummary } from "@/lib/wallet-trace";

function WalletNode({
  chain,
  address,
  label,
  role,
}: {
  chain: ChainId;
  address: string;
  label?: EntityLabel;
  role: string;
}) {
  return (
    <div className="relative flex gap-3 pb-4">
      <span aria-hidden className="relative z-10 mt-1 size-3 shrink-0 rounded-full bg-accent ring-4 ring-surface" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{role}</p>
        <p className="text-sm font-medium">{addressTitle(label)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <HashLink value={address} href={explorerAddressUrl(chain, address)} copyLabel="Salin address" />
          {label ? <EntityLabelBadge label={label} /> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Jejak langkah dana dari wallet asal ke tujuan. Garis vertikal menyambung
 * wallet; kartu di antaranya adalah transfer yang memindahkan dana.
 */
export function TraceStepsPanel({ trace, summary }: { trace: WalletTrace; summary: TraceSummary }) {
  const steps = traceSteps(trace.hops);
  const lastIndex = steps.length - 1;

  return (
    <Panel
      id="jejak-langkah"
      title="Jejak langkah"
      description="Urutan transfer yang menghubungkan wallet asal ke wallet tujuan. Klik hash untuk melihat buktinya."
      icon={Route}
      action={<ClassificationBadge classification="heuristic" />}
    >
      {steps.length === 0 ? (
        <EmptyState
          icon={Footprints}
          title={`Tidak ada jalur dalam ${trace.maxHops} langkah`}
          description="Belum ditemukan transfer yang menghubungkan kedua wallet ini. Bisa jadi jalurnya lebih panjang dari batas pencarian, atau keduanya memang tidak terhubung."
        />
      ) : (
        <EvidenceProvider evidence={evidenceFromHops(trace.chain, trace.hops)}>
          <div className="space-y-4">
            {!summary.connected ? (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Ada langkah yang tidak tersambung: penerima satu transfer bukan pengirim transfer berikutnya.
                Jangan anggap ini satu jalur dana.
              </p>
            ) : null}

            <ol className="relative before:absolute before:top-2 before:bottom-12 before:left-[5px] before:w-0.5 before:bg-line">
              {steps.map(({ hop, number, gapText }, index) => (
                <li key={`${hop.txHash}-${number}`}>
                  {index === 0 ? (
                    <WalletNode chain={trace.chain} address={hop.from} label={hop.fromLabel} role="Asal" />
                  ) : null}
                  <div className="relative mb-4 ml-6 rounded-lg border border-line bg-surface-raised p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold">
                        Langkah {number}
                        {gapText ? <span className="font-normal text-muted"> · {gapText} setelah langkah {number - 1}</span> : null}
                      </p>
                      <ClassificationBadge classification="fact" />
                    </div>
                    <p className="mt-2 text-sm font-medium tabular-nums">
                      {formatTokenAmount(hop.amount, hop.asset.symbol)}
                      <span className="text-xs font-normal text-muted">
                        {" "}
                        · {hop.amountUsd !== undefined ? formatUsdCompact(hop.amountUsd) : "harga tidak diketahui"}
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <time dateTime={hop.timestamp} className="text-[11px] text-muted">
                        {formatDateTime(hop.timestamp)}
                      </time>
                      <EvidenceTrigger txHash={hop.txHash} />
                    </div>
                  </div>
                  <WalletNode
                    chain={trace.chain}
                    address={hop.to}
                    label={hop.toLabel}
                    role={index === lastIndex ? "Tujuan" : "Perantara"}
                  />
                </li>
              ))}
            </ol>

            <p className="rounded-lg bg-surface-raised px-3 py-2 text-[11px] leading-relaxed text-muted">
              Tiap langkah adalah transfer yang tercatat di blockchain. Tapi anggapan bahwa dananya
              &ldquo;sama&rdquo; dari langkah ke langkah adalah dugaan: saldo di wallet perantara bisa
              bercampur dengan dana dari sumber lain.
            </p>
          </div>
        </EvidenceProvider>
      )}
    </Panel>
  );
}
