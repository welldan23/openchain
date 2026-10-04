import {
  ArrowRight,
  BellRing,
  Camera,
  Coins,
  ExternalLink,
  Globe2,
  Info,
  ListChecks,
  Network,
  ShieldAlert,
  ShieldQuestion,
  Tags,
  TriangleAlert,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { ChainBadge, EntityLabelBadge, RiskLevelBadge, SeverityBadge } from "@/components/badges";
import { CaseDataStatusBadge } from "@/components/case/case-badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { ReasonDrawerTrigger } from "@/components/risk/reason-drawer";
import { RiskScoreSummary } from "@/components/risk/risk-score";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { warningAnchorId } from "@/lib/anchors";
import { explorerAddressUrl, explorerTxUrl, getChain } from "@/lib/chains";
import { formatDateTime, formatNumber, formatPct, formatRelativeTime, shortenHash } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CASE_DATA_STATUS_META, CLASSIFICATION_META, RISK_OBJECT_KIND_META, SEVERITY_META } from "@/lib/labels";
import { labelSourceSummary, scoreBreakdown, SEVERITY_ORDER, sortLabels, sortReasons, sortWarnings, urgentWarnings } from "@/lib/risk";
import type { ChainId, ObjectRisk, RiskObjectLink } from "@/lib/types";

const LINK_ICONS: Record<RiskObjectLink["kind"], LucideIcon> = {
  token: Coins,
  flow: Waypoints,
  map: Network,
  multichain: Globe2,
};

/**
 * Hash bukti: yang detailnya tersedia membuka modal bukti, sisanya dibuka di
 * explorer. Harus berada di dalam `EvidenceProvider` halaman.
 */
export function EvidenceHashes({ risk, hashes }: { risk: ObjectRisk; hashes: string[] }) {
  if (hashes.length === 0) {
    return <span className="text-[11px] italic text-muted">Belum ada bukti transaksi, jadi anggap sebagai klaim.</span>;
  }
  const available = new Set(risk.evidence.map((item) => item.txHash.toLowerCase()));
  const chainOf = new Map(risk.evidence.map((item) => [item.txHash.toLowerCase(), item.chain]));
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[11px] text-muted">Bukti ({hashes.length}):</span>
      {hashes.map((hash) =>
        available.has(hash.toLowerCase()) ? (
          <EvidenceTrigger key={hash} txHash={hash} />
        ) : (
          <HashLink key={hash} value={hash} href={explorerTxUrl(chainOf.get(hash.toLowerCase()) ?? risk.chain, hash)} copyLabel="Salin hash transaksi" />
        ),
      )}
    </span>
  );
}

export function RiskObjectHeader({ risk, now }: { risk: ObjectRisk; now: Date }) {
  const [primary] = sortLabels(risk.labels);
  const urgent = urgentWarnings(risk.warnings);
  const [latestUrgent] = sortWarnings(urgent);
  // Warna banner mengikuti peringatan terberat, sama dengan badge keparahannya.
  const worstSeverity = SEVERITY_ORDER.find((severity) => urgent.some((warning) => warning.severity === severity)) ?? "high";
  const chain: ChainId = risk.chain;
  return (
    <header className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <nav aria-label="Lokasi" className="text-xs text-muted">
        <span>Risiko</span>
        <span aria-hidden> / </span>
        <span>{RISK_OBJECT_KIND_META[risk.kind].label}</span>
        <span aria-hidden> / </span>
        <span className="text-foreground/80">{risk.title}</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge title={RISK_OBJECT_KIND_META[risk.kind].description}>{RISK_OBJECT_KIND_META[risk.kind].label}</Badge>
        <ChainBadge chain={chain} />
        <RiskLevelBadge level={risk.level} />
        {primary ? <EntityLabelBadge label={primary} /> : null}
      </div>
      <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{risk.title}</h1>
      <p className="mt-2 flex min-w-0 items-center gap-1 font-mono text-xs text-muted">
        <a
          href={explorerAddressUrl(chain, risk.address)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Buka di ${getChain(chain).name} explorer`}
          className="inline-flex min-w-0 items-center gap-1 rounded hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="truncate sm:hidden">{shortenHash(risk.address, 10, 6)}</span>
          <span className="hidden truncate sm:inline">{risk.address}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
        <CopyButton value={risk.address} label="Salin address" />
      </p>
      {latestUrgent ? (
        <a
          href={`#${warningAnchorId(latestUrgent.id)}`}
          className={cn("mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition hover:brightness-125", SEVERITY_META[worstSeverity].calloutClass)}
        >
          <BellRing className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{urgent.length} peringatan dini perlu dicek.</strong> Terbaru:{" "}
            {latestUrgent.title} ({formatRelativeTime(latestUrgent.detectedAt, now)}).
          </span>
        </a>
      ) : null}
    </header>
  );
}

/** Peringatan bila snapshot tidak lengkap; alasannya ditampilkan apa adanya. */
export function RiskDataStatusNotice({ risk }: { risk: ObjectRisk }) {
  const { dataStatus, statusReason } = risk.snapshot;
  if (dataStatus === "complete") return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">{CASE_DATA_STATUS_META[dataStatus].label}.</strong>{" "}
        {statusReason ?? CASE_DATA_STATUS_META[dataStatus].description}
      </span>
    </p>
  );
}

/** Skor gabungan beserta rincian poin per jenis informasi. */
export function RiskScorePanel({ risk }: { risk: ObjectRisk }) {
  const breakdown = scoreBreakdown(risk);
  const unrated = risk.score === null;
  return (
    <Panel id="skor" title="Skor risiko" description="Jumlah poin dari alasan penilaian di bawah." icon={ShieldAlert} action={<RiskLevelBadge level={risk.level} />}>
      <RiskScoreSummary
        score={risk.score}
        level={risk.level}
        note={
          unrated
            ? `${risk.snapshot.statusReason ?? "Belum dinilai karena datanya belum cukup."} Ini bukan berarti aman.`
            : "Skor ini estimasi. Cek bukti tiap alasan sebelum mengambil kesimpulan."
        }
      />

      {breakdown.parts.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs font-medium text-muted">Asal poin</h3>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {breakdown.parts.map((part) => (
              <li key={part.classification} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <ClassificationBadge classification={part.classification} detail={`${part.points} poin dari ${part.reasonCount} alasan.`} />
                  <span className="text-[11px] text-muted">{part.reasonCount} alasan</span>
                </span>
                <span className="font-mono text-sm tabular-nums">+{part.points}</span>
              </li>
            ))}
          </ul>
          {breakdown.uncounted > 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {breakdown.uncounted} alasan tidak ikut dihitung karena belum didukung bukti on-chain.
            </p>
          ) : null}
          {breakdown.unexplained ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {breakdown.unexplained > 0
                ? `${breakdown.unexplained} poin skor belum dijelaskan alasan mana pun.`
                : `Jumlah poin alasan ${-breakdown.unexplained} lebih besar dari skor; skor dibatasi.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

/** Alasan penilaian: tiap alasan dengan tingkat, jenis informasi, poin, dan bukti. */
export function RiskReasonsPanel({ risk }: { risk: ObjectRisk }) {
  const reasons = sortReasons(risk.reasons);
  return (
    <Panel id="alasan" title="Alasan penilaian" description={reasons.length === 0 ? "Belum ada alasan" : `${reasons.length} alasan, terberat dulu`} icon={ListChecks}>
      {reasons.length === 0 ? (
        <EmptyState
          icon={ShieldQuestion}
          title="Belum ada alasan penilaian"
          description="Tidak ada pola berisiko yang terdeteksi pada snapshot ini. Ini bukan jaminan aman, karena sebagian modul analisis mungkin belum punya cukup data."
        />
      ) : (
        <ol className="divide-y divide-line">
          {reasons.map((reason) => (
            <li key={reason.id} id={`alasan-${reason.id}`} className="scroll-mt-20 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={reason.severity} />
                  <ClassificationBadge
                    classification={reason.classification}
                    detail={reason.points === null ? "Tidak ikut dihitung ke skor." : `Menyumbang ${reason.points} poin ke skor.`}
                  />
                </span>
                <span
                  className="font-mono text-xs tabular-nums text-muted"
                  title={reason.points === null ? "Tidak ikut dihitung ke skor" : "Sumbangan ke skor"}
                >
                  {reason.points === null ? "tidak dihitung" : `+${reason.points} poin`}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-medium">{reason.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{reason.description}</p>
              <div className="mt-2">
                <EvidenceHashes risk={risk} hashes={reason.evidenceTxHashes} />
              </div>
              <div className="mt-3">
                <ReasonDrawerTrigger reasonId={reason.id} evidenceCount={new Set(reason.evidenceTxHashes).size} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Label entitas beserta sumbernya: eksternal atau dugaan internal. */
export function RiskLabelsPanel({ risk }: { risk: ObjectRisk }) {
  const labels = sortLabels(risk.labels);
  const summary = labelSourceSummary(labels);
  return (
    <Panel
      id="label"
      title="Label & sumbernya"
      description={labels.length === 0 ? "Belum ada label" : `${summary.external} dari sumber luar, ${summary.heuristic} dugaan OpenChain`}
      icon={Tags}
    >
      {labels.length === 0 ? (
        <EmptyState icon={Tags} title="Belum ada label" description="Objek ini belum dilabeli sumber luar maupun dugaan OpenChain." />
      ) : (
        <ul className="space-y-3">
          {labels.map((label) => (
            <li key={`${label.type}:${label.sourceName}:${label.name ?? ""}`} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <EntityLabelBadge label={label} />
                <ClassificationBadge
                  classification={label.source === "external" ? "external_label" : "heuristic"}
                  detail={`Sumber: ${label.sourceName}${label.confidence === undefined ? "" : ` · keyakinan ${formatPct(label.confidence * 100, { maximumFractionDigits: 0 })}`}.`}
                />
              </div>
              <dl className="mt-2 space-y-1.5 text-xs">
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted">Sumber:</dt>
                  <dd>{label.sourceName}</dd>
                </div>
                {label.confidence !== undefined ? (
                  <div className="flex flex-wrap gap-x-1.5">
                    <dt className="text-muted">Keyakinan:</dt>
                    <dd className="tabular-nums">{formatPct(label.confidence * 100, { maximumFractionDigits: 0 })}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="sr-only">Dasar</dt>
                  <dd className="leading-relaxed text-foreground/85">{label.basis}</dd>
                </div>
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted">Diberikan:</dt>
                  <dd>
                    <time dateTime={label.addedAt}>{formatDateTime(label.addedAt)}</time>
                  </dd>
                </div>
              </dl>
              <div className="mt-2">
                <EvidenceHashes risk={risk} hashes={label.evidenceTxHashes} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {CLASSIFICATION_META.heuristic.description} Label dari sumber luar juga bisa keliru, jadi sumbernya selalu ditampilkan.
      </p>
    </Panel>
  );
}

export function RiskLinksPanel({ risk }: { risk: ObjectRisk }) {
  if (risk.links.length === 0) return null;
  return (
    <Panel id="tautan" title="Investigasi terkait" description="Halaman lain untuk objek yang sama." icon={ArrowRight}>
      <ul className="space-y-1">
        {risk.links.map((link) => {
          const Icon = LINK_ICONS[link.kind];
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex items-center gap-2 rounded-lg p-2 text-sm transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Icon className="size-4 shrink-0 text-muted group-hover:text-accent" aria-hidden />
                <span className="min-w-0 flex-1 truncate group-hover:text-accent">{link.title}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Kapan dan dari mana data penilaian diambil. */
export function RiskSnapshotPanel({ risk }: { risk: ObjectRisk }) {
  const { snapshot } = risk;
  return (
    <Panel id="snapshot" title="Snapshot data" description="Penilaian ini memakai data pada titik ini." icon={Camera}>
      <dl className="space-y-3 text-xs">
        <div>
          <dt className="text-muted">Diambil</dt>
          <dd className="mt-0.5">
            <time dateTime={snapshot.fetchedAt}>{formatDateTime(snapshot.fetchedAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-muted">{getChain(risk.chain).addressFormat === "solana" ? "Slot" : "Blok"}</dt>
          <dd className="mt-0.5 font-mono tabular-nums">{formatNumber(snapshot.blockNumber)}</dd>
        </div>
        <div>
          <dt className="text-muted">Sumber</dt>
          <dd className="mt-0.5">{snapshot.sources.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted">Kelengkapan</dt>
          <dd className="mt-1 space-y-1">
            <CaseDataStatusBadge status={snapshot.dataStatus} />
            {snapshot.statusReason ? <p className="leading-relaxed text-muted">{snapshot.statusReason}</p> : null}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
