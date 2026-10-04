import { BellRing, CircleCheck, CircleDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import { SeverityBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { warningAnchorId } from "@/lib/anchors";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { DANGER_CATEGORY_META, DANGER_STATUS_META, DANGER_TRAIT_META } from "@/lib/labels";
import { groupTraitChecks, isNewWarning, NEW_WARNING_HOURS, SEVERITY_ORDER, sortWarnings, traitCheckCounts, warningSummary } from "@/lib/risk";
import type { DangerTraitCheck, DangerTraitStatus, ObjectRisk } from "@/lib/types";
import { EvidenceHashes } from "./risk-object";

const STATUS_ICONS: Record<DangerTraitStatus, LucideIcon> = {
  detected: TriangleAlert,
  unknown: CircleDashed,
  clear: CircleCheck,
};

/** Tautan ke bukti ciri yang terdeteksi: peringatan atau alasan penilaian di halaman ini. */
function TraitReference({ check, risk }: { check: DangerTraitCheck; risk: ObjectRisk }) {
  const warning = check.warningId ? risk.warnings.find((item) => item.id === check.warningId) : undefined;
  const reason = check.reasonId ? risk.reasons.find((item) => item.id === check.reasonId) : undefined;
  const target = warning
    ? { href: `#${warningAnchorId(warning.id)}`, text: "Lihat peringatan" }
    : reason
      ? { href: `#alasan-${reason.id}`, text: "Lihat alasan penilaian" }
      : null;
  if (!check.note && !target) return null;
  return (
    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
      {check.note}
      {check.note && target ? " " : null}
      {target ? (
        <a href={target.href} className="text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent">
          {target.text}
        </a>
      ) : null}
    </p>
  );
}

/**
 * Peringatan dini dan daftar ciri berbahaya yang dipantau. Ciri yang belum
 * bisa dicek ditulis apa adanya, supaya "tidak ada peringatan" tidak terbaca
 * sebagai "aman".
 */
export function RiskWarningsPanel({ risk, now }: { risk: ObjectRisk; now: Date }) {
  const warnings = sortWarnings(risk.warnings);
  // "Baru" diukur dari waktu snapshot, supaya penilaian lama yang dibuka ulang tetap konsisten.
  const snapshotAt = new Date(risk.snapshot.fetchedAt);
  const summary = warningSummary(risk.warnings, snapshotAt);
  const groups = groupTraitChecks(risk.traitChecks);
  const counts = traitCheckCounts(risk.traitChecks);

  return (
    <Panel
      id="peringatan"
      title="Peringatan dini"
      description={
        summary.total === 0
          ? "Belum ada pola berbahaya baru"
          : `${summary.total} peringatan, ${summary.newCount} baru dalam ${NEW_WARNING_HOURS} jam sebelum snapshot`
      }
      icon={BellRing}
    >
      {warnings.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="Tidak ada peringatan baru"
          description="Belum ada pola berbahaya baru pada snapshot ini. Cek daftar ciri di bawah: ciri yang belum bisa dicek bukan berarti aman."
        />
      ) : (
        <>
          <ul aria-label="Jumlah peringatan per tingkat" className="mb-3 flex flex-wrap items-center gap-2">
            {SEVERITY_ORDER.filter((severity) => summary.bySeverity[severity] > 0).map((severity) => (
              <li key={severity} className="inline-flex items-center gap-1 text-[11px] text-muted">
                <SeverityBadge severity={severity} />
                <span className="tabular-nums">×{summary.bySeverity[severity]}</span>
              </li>
            ))}
            {summary.newCount > 0 ? (
              <li className="text-[11px] text-accent">{summary.newCount} baru</li>
            ) : null}
          </ul>
          <ul className="space-y-3">
            {warnings.map((warning) => {
              const fresh = isNewWarning(warning, snapshotAt);
              return (
                <li
                  key={warning.id}
                  id={warningAnchorId(warning.id)}
                  className={cn("scroll-mt-20 rounded-lg border p-3 sm:p-4", fresh ? "border-accent/40 bg-accent/5" : "border-line")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={warning.severity} />
                      <Badge title={DANGER_TRAIT_META[warning.trait].description}>
                        {DANGER_CATEGORY_META[DANGER_TRAIT_META[warning.trait].category].label} · {DANGER_TRAIT_META[warning.trait].label}
                      </Badge>
                      <ClassificationBadge classification={warning.classification} />
                      {fresh ? <Badge className="bg-accent/15 text-accent ring-accent/40" title={`Terdeteksi dalam ${NEW_WARNING_HOURS} jam sebelum snapshot`}>Baru</Badge> : null}
                    </span>
                    <time dateTime={warning.detectedAt} title={formatDateTime(warning.detectedAt)} className="text-[11px] text-muted">
                      {formatRelativeTime(warning.detectedAt, now)}
                    </time>
                  </div>
                  <h3 className="mt-2 text-sm font-medium">{warning.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/85">{warning.description}</p>
                  <div className="mt-2">
                    <EvidenceHashes risk={risk} hashes={warning.evidenceTxHashes} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section aria-labelledby="ciri-title" className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="ciri-title" className="text-xs font-semibold">
            Ciri berbahaya yang dipantau
          </h3>
          {risk.traitChecks.length > 0 ? (
            <p className="text-[11px] text-muted">
              {counts.detected} terdeteksi · {counts.unknown} belum bisa dicek · {counts.clear} tidak terdeteksi
            </p>
          ) : null}
        </div>
        {groups.length === 0 ? (
          <p className="mt-2 text-xs text-muted">Belum ada ciri yang dipantau untuk objek ini.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.category}>
                <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted">{DANGER_CATEGORY_META[group.category].label}</h4>
                <ul className="mt-1.5 space-y-2">
                  {group.checks.map((check) => {
                    const meta = DANGER_TRAIT_META[check.trait];
                    const status = DANGER_STATUS_META[check.status];
                    const Icon = STATUS_ICONS[check.status];
                    return (
                      <li key={check.trait} className="flex gap-2">
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", status.className)} aria-hidden />
                        <div className="min-w-0">
                          <p className="text-xs">
                            <span className="font-medium" title={meta.description}>
                              {meta.label}
                            </span>{" "}
                            <span className={cn("text-[11px]", status.className)}>· {status.label}</span>
                          </p>
                          <TraitReference check={check} risk={risk} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </Panel>
  );
}
