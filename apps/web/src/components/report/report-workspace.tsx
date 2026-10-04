import { Camera, ClipboardCheck, ExternalLink, FileSearch, FolderOpen, Info, ListTree, NotebookPen, OctagonAlert, Target, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { CaseDataStatusBadge } from "@/components/case/case-badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceMovements, EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { Panel } from "@/components/ui/panel";
import { explorerTxUrl, getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, formatRelativeTime, shortenHash } from "@/lib/format";
import { CASE_DATA_STATUS_META, RISK_TONES } from "@/lib/labels";
import { reportBlockAnchor, reportOutline, reportSectionAnchor, reportStats, type ReportIssue } from "@/lib/report";
import type { InvestigationReport, ReportBlock } from "@/lib/types";
import { ReportReadinessBadge, ReportStatusBadge } from "./report-badges";

export function ReportHeader({ report, issues, now }: { report: InvestigationReport; issues: ReportIssue[]; now: Date }) {
  const stats = reportStats(report);
  return (
    <header className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <nav aria-label="Lokasi" className="text-xs text-muted">
        <Link href="/laporan" className="rounded hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
          Laporan
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground/80">{report.title}</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ReportStatusBadge status={report.status} />
        <ReportReadinessBadge blockerCount={issues.filter((issue) => issue.level === "blocker").length} />
        {report.snapshot.dataStatus !== "complete" ? <CaseDataStatusBadge status={report.snapshot.dataStatus} /> : null}
      </div>
      <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{report.title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{report.summary}</p>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
        {report.source ? (
          <div>
            <dt className="text-muted">Dari kasus</dt>
            <dd className="mt-0.5">
              <Link href={report.source.href} className="inline-flex items-center gap-1 rounded hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                <FolderOpen className="size-3.5 text-muted" aria-hidden />
                {report.source.title}
              </Link>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted">Dibuat</dt>
          <dd className="mt-0.5">
            <time dateTime={report.createdAt}>{formatDateTime(report.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Diperbarui</dt>
          <dd className="mt-0.5">
            <time dateTime={report.updatedAt} title={formatDateTime(report.updatedAt)}>
              {formatRelativeTime(report.updatedAt, now)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Isi</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatNumber(stats.sectionCount)} bagian · {formatNumber(stats.claimCount)} klaim · {formatNumber(stats.evidenceCount)} bukti ·{" "}
            {formatNumber(stats.noteCount)} catatan
          </dd>
        </div>
      </dl>
    </header>
  );
}

/** Daftar isi dengan jumlah blok dan tanda masalah per bagian. */
export function ReportOutline({ report, issues }: { report: InvestigationReport; issues: ReportIssue[] }) {
  return (
    <nav aria-labelledby="daftar-isi-title" className="rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-20">
      <h2 id="daftar-isi-title" className="flex items-center gap-2 text-xs font-semibold">
        <ListTree className="size-3.5 text-accent" aria-hidden />
        Daftar isi
      </h2>
      <ol className="mt-3 space-y-1">
        {reportOutline(report, issues).map((item, index) => (
          <li key={item.id}>
            <a
              href={`#${reportSectionAnchor(item.id)}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition hover:bg-surface-raised hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="tabular-nums text-muted">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              {item.blockers > 0 ? (
                <span className={cn("inline-flex items-center gap-0.5 tabular-nums", RISK_TONES.critical.textClass)} title={`${item.blockers} perlu dilengkapi`}>
                  <OctagonAlert className="size-3" aria-hidden />
                  {item.blockers}
                  <span className="sr-only"> perlu dilengkapi</span>
                </span>
              ) : null}
              {item.warnings > 0 ? (
                <span className={cn("inline-flex items-center gap-0.5 tabular-nums", RISK_TONES.medium.textClass)} title={`${item.warnings} peringatan`}>
                  <TriangleAlert className="size-3" aria-hidden />
                  {item.warnings}
                  <span className="sr-only"> peringatan</span>
                </span>
              ) : null}
              {item.blockers === 0 && item.warnings === 0 ? (
                <span className="text-[11px] tabular-nums text-muted">{item.blockCount}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function MissingValue({ children }: { children: string }) {
  return <span className={cn("italic", RISK_TONES.critical.textClass)}>{children}</span>;
}

function Block({ block, report, flagged, highlighted }: { block: ReportBlock; report: InvestigationReport; flagged: boolean; highlighted: boolean }) {
  const anchor = reportBlockAnchor(block.id);
  if (block.kind === "paragraph") {
    return (
      <p id={anchor} className="scroll-mt-20 text-sm leading-relaxed text-foreground/90">
        {block.text}
      </p>
    );
  }
  if (block.kind === "note") {
    return (
      <aside id={anchor} className="scroll-mt-20 rounded-lg border border-line bg-surface-raised/60 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <NotebookPen className="size-3.5" aria-hidden />
          Catatan investigasi · <time dateTime={block.createdAt}>{formatDateTime(block.createdAt)}</time>
        </p>
        <p className="mt-1 text-sm leading-relaxed">{block.body}</p>
      </aside>
    );
  }
  if (block.kind === "claim") {
    const { claim } = block;
    return (
      <div
        id={anchor}
        className={cn(
          "scroll-mt-20 rounded-lg border p-3 transition sm:p-4",
          flagged ? "border-rose-400/40" : highlighted ? "border-accent/60 bg-accent/5" : "border-line",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-medium">{claim.title}</h3>
          <ClassificationBadge classification={claim.classification} />
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{claim.detail}</p>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Provider</dt>
          <dd>{claim.provider ?? <MissingValue>belum disebut</MissingValue>}</dd>
          <dt className="text-muted">Waktu data</dt>
          <dd>
            {claim.observedAt ? <time dateTime={claim.observedAt}>{formatDateTime(claim.observedAt)}</time> : <MissingValue>belum dicantumkan</MissingValue>}
          </dd>
          <dt className="text-muted">Bukti</dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {claim.evidenceTxHashes.length > 0 ? (
              claim.evidenceTxHashes.map((hash) => <EvidenceTrigger key={hash} txHash={hash} />)
            ) : (
              <span className="italic text-muted">belum ada hash transaksi</span>
            )}
          </dd>
        </dl>
      </div>
    );
  }
  if (block.kind === "entity") {
    const { subject } = block;
    return (
      <div id={anchor} className={cn("scroll-mt-20 rounded-lg border p-3 transition", highlighted ? "border-accent/60 bg-accent/5" : "border-line")}>
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Target className="size-3.5" aria-hidden />
          {subject.kind === "token" ? "Token" : "Address"}
          {subject.chain ? <ChainBadge chain={subject.chain} /> : <span>· semua chain EVM</span>}
          {subject.label ? <EntityLabelBadge label={subject.label} /> : null}
        </p>
        <p className="mt-1 text-sm font-medium">
          <Link href={subject.href} className="rounded hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
            {subject.title}
          </Link>
        </p>
        <p className="mt-0.5 break-all font-mono text-[11px] text-muted">{subject.address}</p>
      </div>
    );
  }
  const stored = report.evidence.find((item) => item.chain === block.chain && item.txHash.toLowerCase() === block.txHash.toLowerCase());
  const chain = getChain(block.chain);
  return (
    <figure id={anchor} className="scroll-mt-20 space-y-2 rounded-lg border border-line p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <FileSearch className="size-3.5" aria-hidden />
          Bukti tersemat · <ChainBadge chain={block.chain} />
          {stored ? (
            <>
              {" · "}
              <time dateTime={stored.timestamp}>{formatDateTime(stored.timestamp)}</time>
            </>
          ) : null}
        </span>
        <ClassificationBadge classification={stored ? "fact" : "unavailable"} />
      </div>
      <p className="break-all rounded-md bg-surface-raised px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">{block.txHash}</p>
      {stored ? (
        <EvidenceMovements evidence={stored} />
      ) : (
        <p className="text-xs leading-relaxed text-muted">Rincian perpindahan transaksi ini belum tersimpan. Buka di explorer untuk melihat isinya.</p>
      )}
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-foreground/85">{block.caption}</span>
        <a
          href={explorerTxUrl(block.chain, block.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          {shortenHash(block.txHash)} di {chain.explorer.name}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </figcaption>
    </figure>
  );
}

/** Isi laporan per bagian, seperti yang akan dibaca penerima laporan. */
export function ReportDocument({
  report,
  issues,
  highlighted = new Set(),
  toolbar,
}: {
  report: InvestigationReport;
  issues: ReportIssue[];
  /** Blok yang baru ditambahkan, disorot sebentar. */
  highlighted?: ReadonlySet<string>;
  /** Tombol aksi di atas isi laporan. */
  toolbar?: ReactNode;
}) {
  const flagged = new Set(issues.filter((issue) => issue.level === "blocker" && issue.blockId).map((issue) => issue.blockId));
  return (
    <article aria-label={`Isi laporan ${report.title}`} className="space-y-5">
      {toolbar}
      {report.sections.map((section, index) => (
        <section
          key={section.id}
          id={reportSectionAnchor(section.id)}
          aria-labelledby={`${reportSectionAnchor(section.id)}-title`}
          className="scroll-mt-20 rounded-xl border border-line bg-surface p-4 sm:p-5"
        >
          <h2 id={`${reportSectionAnchor(section.id)}-title`} className="text-base font-semibold">
            <span className="mr-1.5 tabular-nums text-muted">{index + 1}.</span>
            {section.title}
          </h2>
          {section.blocks.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
              Bagian ini masih kosong.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {section.blocks.map((block) => (
                <Block key={block.id} block={block} report={report} flagged={flagged.has(block.id)} highlighted={highlighted.has(block.id)} />
              ))}
            </div>
          )}
        </section>
      ))}
    </article>
  );
}

/** Masalah kesiapan: penghalang dulu, lalu peringatan; tiap masalah menuju letaknya. */
export function ReportReadinessPanel({ issues }: { issues: ReportIssue[] }) {
  const blockers = issues.filter((issue) => issue.level === "blocker");
  const warnings = issues.filter((issue) => issue.level === "warning");
  return (
    <Panel
      id="kesiapan"
      title="Kesiapan laporan"
      description={
        blockers.length === 0
          ? "Semua klaim punya provider, waktu, dan bukti yang dibutuhkan."
          : `${blockers.length} hal perlu dilengkapi sebelum dibagikan.`
      }
      icon={ClipboardCheck}
      action={<ReportReadinessBadge blockerCount={blockers.length} />}
    >
      {issues.length === 0 ? (
        <p className="text-xs text-muted">Tidak ada masalah. Laporan siap dibagikan.</p>
      ) : (
        <ul className="space-y-2">
          {[...blockers, ...warnings].map((issue, index) => {
            const Icon = issue.level === "blocker" ? OctagonAlert : TriangleAlert;
            const tone = issue.level === "blocker" ? RISK_TONES.critical : RISK_TONES.medium;
            const href = issue.blockId ? `#${reportBlockAnchor(issue.blockId)}` : issue.sectionId ? `#${reportSectionAnchor(issue.sectionId)}` : "#snapshot";
            return (
              <li key={`${issue.kind}:${issue.blockId ?? issue.sectionId ?? index}`}>
                <a href={href} className="flex gap-2 rounded-md p-1.5 text-xs leading-relaxed transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone.textClass)} aria-hidden />
                  <span>
                    <span className="sr-only">{issue.level === "blocker" ? "Perlu dilengkapi: " : "Peringatan: "}</span>
                    {issue.message}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Setiap klaim penting wajib menyebut provider dan waktu datanya, serta hash transaksi bila ada. Yang kosong tidak diisi tebakan.
      </p>
    </Panel>
  );
}

/** Snapshot data yang dipakai laporan, supaya bisa direproduksi. */
export function ReportSnapshotPanel({ report }: { report: InvestigationReport }) {
  const { snapshot } = report;
  return (
    <Panel id="snapshot" title="Snapshot data" description="Laporan memakai data pada titik ini." icon={Camera}>
      <dl className="space-y-3 text-xs">
        <div>
          <dt className="text-muted">Diambil</dt>
          <dd className="mt-0.5">
            <time dateTime={snapshot.fetchedAt}>{formatDateTime(snapshot.fetchedAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Blok per chain</dt>
          <dd className="mt-1">
            {snapshot.blocks.length === 0 ? (
              <span className="text-muted">Belum ada blok tercatat.</span>
            ) : (
              <ul className="space-y-1">
                {snapshot.blocks.map((block) => (
                  <li key={block.chain} className="flex items-center justify-between gap-2">
                    <ChainBadge chain={block.chain} />
                    <span className="font-mono tabular-nums text-foreground/85">
                      {getChain(block.chain).addressFormat === "solana" ? "slot" : "blok"} {formatNumber(block.blockNumber)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Sumber</dt>
          <dd className="mt-0.5">{snapshot.sources.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted">Kelengkapan</dt>
          <dd className="mt-1 space-y-1">
            <CaseDataStatusBadge status={snapshot.dataStatus} />
            <p className="leading-relaxed text-muted">{snapshot.statusReason ?? CASE_DATA_STATUS_META[snapshot.dataStatus].description}</p>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
