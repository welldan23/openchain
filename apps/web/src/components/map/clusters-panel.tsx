import { Boxes, CircleCheck, CircleMinus, Info, TriangleAlert } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { Badge } from "@/components/ui/badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerTxUrl } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { formatPct, formatUsdCompact } from "@/lib/format";
import { CLUSTER_CONFIDENCE_META, CLUSTER_LABEL_META } from "@/lib/labels";
import type { ChainId, ClusterConfidence } from "@/lib/types";
import { NEUTRAL_NODE_COLOR, type ClusterStyle } from "@/lib/wallet-map";

/** Tiga balok kecil; jumlah yang terisi menunjukkan tingkat keyakinan. */
function ConfidenceMeter({ confidence }: { confidence: ClusterConfidence }) {
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ClusterCard({ chain, style }: { chain: ChainId; style: ClusterStyle }) {
  const { cluster } = style;
  const matched = cluster.signals.filter((signal) => signal.matched).length;
  return (
    <article aria-labelledby={`klaster-${cluster.id}`} className="rounded-lg border border-line p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`klaster-${cluster.id}`} className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: style.color ?? NEUTRAL_NODE_COLOR }} />
          {cluster.name}
        </h3>
        <ConfidenceMeter confidence={cluster.confidence} />
      </header>

      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Klasifikasi kelompok">
        {cluster.labels.map((label) => {
          const meta = CLUSTER_LABEL_META[label];
          return (
            <li key={label}>
              <Badge className={meta.className} title={meta.description}>
                {meta.label}
              </Badge>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-foreground/85">{cluster.reason}</p>

      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-surface-raised px-3 py-2.5 sm:grid-cols-4">
        <Stat label="Wallet" value={String(style.memberCount)} />
        <Stat label="Porsi supply" value={formatPct(style.sharePct)} />
        <Stat label="Pendanaan diterima" value={formatUsdCompact(style.fundingUsd)} />
        <Stat label="Transfer antar anggota" value={String(style.internalLinkCount)} />
      </dl>

      <section aria-label="Sinyal yang dicek" className="mt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Sinyal yang dicek ({matched} dari {cluster.signals.length} terpenuhi)
        </h4>
        <ul className="mt-2 space-y-2">
          {cluster.signals.map((signal) => {
            const Icon = signal.matched ? CircleCheck : CircleMinus;
            return (
              <li key={signal.id} className="flex gap-2">
                <Icon
                  className={cn("mt-0.5 size-3.5 shrink-0", signal.matched ? "text-emerald-400" : "text-muted")}
                  aria-label={signal.matched ? "Terpenuhi" : "Tidak terpenuhi"}
                />
                <div className="min-w-0">
                  <p className={cn("text-xs font-medium", !signal.matched && "text-foreground/70")}>{signal.label}</p>
                  <p className="text-[11px] leading-relaxed text-muted">{signal.detail}</p>
                  {signal.evidenceTxHashes.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[11px] text-muted">Bukti:</span>
                      {signal.evidenceTxHashes.slice(0, 3).map((hash) => (
                        <HashLink key={hash} value={hash} href={explorerTxUrl(chain, hash)} head={8} tail={4} copyLabel="Salin hash bukti" />
                      ))}
                      {signal.evidenceTxHashes.length > 3 ? (
                        <span className="text-[11px] text-muted">+{signal.evidenceTxHashes.length - 3} lagi</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {cluster.caveats.length > 0 ? (
        <section aria-label="Kemungkinan salah duga" className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2.5">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200">
            <TriangleAlert className="size-3.5" aria-hidden />
            Bisa jadi bukan seperti dugaan
          </h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[11px] leading-relaxed text-amber-100/80">
            {cluster.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

/** Ringkasan tiap kelompok: klasifikasi, keyakinan, angka, sinyal, dan catatan. */
export function ClustersPanel({ chain, styles }: { chain: ChainId; styles: ClusterStyle[] }) {
  const clusteredShare = styles.reduce((sum, style) => sum + style.sharePct, 0);
  return (
    <Panel
      id="klaster"
      title="Ringkasan kelompok"
      description={
        styles.length > 0
          ? `${styles.length} kelompok · ${formatPct(clusteredShare)} supply dipegang anggota kelompok`
          : "Kelompok wallet yang diduga terkait."
      }
      icon={Boxes}
      action={<ClassificationBadge classification="heuristic" />}
    >
      {styles.length === 0 ? (
        <EmptyState title="Belum ada kelompok" description="Belum ditemukan pola yang cukup kuat untuk mengelompokkan wallet." />
      ) : (
        <div className="space-y-4">
          {styles.map((style) => (
            <ClusterCard key={style.cluster.id} chain={chain} style={style} />
          ))}
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Pengelompokan adalah dugaan dari pola transaksi. Bobotnya diturunkan bila sumber dananya exchange,
            router, bridge, atau pool likuiditas, dan label orang dalam hanya dipakai bila ada bukti transaksi langsung.
          </p>
        </div>
      )}
    </Panel>
  );
}

/** Arti warna, cincin, dan jenis garis di peta. */
export function MapLegendPanel() {
  return (
    <Panel id="legenda-peta" title="Legenda peta" description="Arti bentuk dan garis di peta." icon={Info}>
      <dl className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <dt className="flex w-10 shrink-0 justify-center">
            <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: NEUTRAL_NODE_COLOR }} />
          </dt>
          <dd className="text-muted">Wallet tanpa kelompok</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="flex w-10 shrink-0 justify-center">
            <span aria-hidden className="size-3 rounded-full border-2" style={{ borderColor: NEUTRAL_NODE_COLOR }} />
          </dt>
          <dd className="text-muted">Bukan holder, muncul karena terhubung</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="flex w-10 shrink-0 justify-center">
            <svg aria-hidden width="32" height="4" className="text-muted">
              <line x1="1" y1="2" x2="31" y2="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 4" />
            </svg>
          </dt>
          <dd className="text-muted">Pendanaan native coin (mis. ETH, SOL)</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="flex w-10 shrink-0 justify-center">
            <svg aria-hidden width="32" height="4" className="text-muted">
              <line x1="1" y1="2" x2="31" y2="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </dt>
          <dd className="text-muted">Transfer token</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="flex w-10 shrink-0 justify-center">
            <span aria-hidden className="size-4 rounded-md border border-dashed border-muted" />
          </dt>
          <dd className="text-muted">Area kelompok (warna sesuai chip kelompok)</dd>
        </div>
      </dl>
    </Panel>
  );
}
