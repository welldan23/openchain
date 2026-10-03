import {
  ArrowRight,
  Camera,
  ChevronRight,
  FileSearch,
  Flag,
  History,
  Info,
  NotebookPen,
  Tag,
  Target,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceProvider, EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { INVESTIGATION_KIND_META } from "@/components/search/kind-meta";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { orderCaseEvidence } from "@/lib/cases";
import { getChain } from "@/lib/chains";
import { formatDateTime, formatNumber, formatRelativeTime, formatTokenAmount, formatUsdCompact, shortenHash } from "@/lib/format";
import { addressTitle } from "@/lib/fund-flow";
import { CASE_DATA_STATUS_META, CASE_STATUS_META } from "@/lib/labels";
import type { InvestigationCase, TxEvidence } from "@/lib/types";
import { CaseDataStatusBadge, CaseStatusBadge } from "./case-badges";

export function CaseHeader({ item, now }: { item: InvestigationCase; now: Date }) {
  return (
    <header className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <nav aria-label="Lokasi" className="text-xs text-muted">
        <Link href="/kasus" className="rounded hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
          Kasus
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground/80">{item.title}</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CaseStatusBadge status={item.status} />
        <CaseDataStatusBadge status={item.snapshot.dataStatus} />
      </div>
      <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{item.title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{item.summary}</p>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">Tahap</dt>
          <dd className="mt-0.5">{CASE_STATUS_META[item.status].description}</dd>
        </div>
        <div>
          <dt className="text-muted">Dibuat</dt>
          <dd className="mt-0.5">
            <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Diperbarui</dt>
          <dd className="mt-0.5">
            <time dateTime={item.updatedAt} title={formatDateTime(item.updatedAt)}>
              {formatRelativeTime(item.updatedAt, now)}
            </time>
          </dd>
        </div>
      </dl>
      {item.tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tag">
          {item.tags.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-foreground/80 ring-1 ring-line">
              <Tag className="size-3 text-muted" aria-hidden />
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

/** Peringatan bila snapshot kasus tidak lengkap; alasannya ditampilkan apa adanya. */
export function CaseDataStatusNotice({ item }: { item: InvestigationCase }) {
  const { dataStatus, statusReason } = item.snapshot;
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

function movementSummary(evidence: TxEvidence): string {
  const [first] = evidence.movements;
  if (!first) return "Belum ada rincian perpindahan";
  const from = first.fromLabel ? addressTitle(first.fromLabel) : shortenHash(first.from);
  const to = first.toLabel ? addressTitle(first.toLabel) : shortenHash(first.to);
  const more = evidence.movements.length > 1 ? ` +${evidence.movements.length - 1} perpindahan` : "";
  return `${formatTokenAmount(first.amount, first.asset.symbol)} · ${from} → ${to}${more}`;
}

/**
 * Temuan dan bukti dalam satu penyedia modal bukti: hash di temuan dan di
 * daftar bukti membuka modal yang sama (dan bisa ditautkan lewat #bukti-…).
 */
export function CaseFindingsAndEvidence({ item }: { item: InvestigationCase }) {
  const evidence = orderCaseEvidence(item);
  const citedBy = new Map<string, number>();
  for (const finding of item.findings) {
    for (const hash of new Set(finding.evidenceTxHashes.map((value) => value.toLowerCase()))) {
      citedBy.set(hash, (citedBy.get(hash) ?? 0) + 1);
    }
  }
  return (
    <EvidenceProvider evidence={item.evidence}>
      <Panel id="temuan" title="Temuan" description={`${item.findings.length} temuan, masing-masing dengan hash bukti`} icon={Flag}>
        {item.findings.length === 0 ? (
          <EmptyState icon={Flag} title="Belum ada temuan" description="Temuan yang disimpan ke kasus ini akan muncul di sini." />
        ) : (
          <ol className="space-y-3">
            {item.findings.map((finding) => (
              <li key={finding.id} className="rounded-lg border border-line p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-medium">{finding.title}</h3>
                  <ClassificationBadge classification={finding.classification} />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">{finding.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-[11px] text-muted">Bukti:</span>
                  {finding.evidenceTxHashes.map((hash) => (
                    <EvidenceTrigger key={hash} txHash={hash} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel
        id="bukti"
        title="Bukti transaksi"
        description={`${evidence.length} transaksi. Yang dirujuk temuan ada di atas.`}
        icon={FileSearch}
        className="mt-5"
      >
        {evidence.length === 0 ? (
          <EmptyState icon={FileSearch} title="Belum ada bukti" description="Hash transaksi yang mendukung temuan akan muncul di sini." />
        ) : (
          <ul className="divide-y divide-line">
            {evidence.map((entry) => {
              const cited = citedBy.get(entry.txHash.toLowerCase()) ?? 0;
              const totalUsd = entry.movements.reduce((sum, movement) => sum + (movement.amountUsd ?? 0), 0);
              return (
                <li key={entry.txHash} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:w-64 sm:shrink-0">
                    <ChainBadge chain={entry.chain} />
                    <EvidenceTrigger txHash={entry.txHash} />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-xs text-foreground/85" title={movementSummary(entry)}>
                    {movementSummary(entry)}
                  </p>
                  <p className="flex shrink-0 flex-wrap items-center gap-x-3 text-[11px] text-muted">
                    {totalUsd > 0 ? <span className="tabular-nums">±{formatUsdCompact(totalUsd)}</span> : null}
                    <time dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)}</time>
                    {cited > 0 ? <span className="text-accent">Mendukung {cited} temuan</span> : null}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </EvidenceProvider>
  );
}

export function CaseSubjectsPanel({ item }: { item: InvestigationCase }) {
  return (
    <Panel id="subjek" title="Subjek kasus" description="Token dan address yang diselidiki." icon={Target}>
      <ul className="space-y-2">
        {item.subjects.map((subject) => (
          <li key={`${subject.chain ?? "multi"}:${subject.address}`}>
            <Link
              href={subject.href}
              className="group flex items-start gap-2 rounded-lg p-2 transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium group-hover:text-accent">{subject.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted">{subject.kind === "token" ? "Token" : "Address"}</span>
                  {subject.chain ? <ChainBadge chain={subject.chain} /> : <span className="text-[11px] text-muted">· semua chain EVM</span>}
                  {subject.label ? <EntityLabelBadge label={subject.label} interactive={false} /> : null}
                </span>
                <span className="mt-1 block truncate font-mono text-[11px] text-muted" title={subject.address}>
                  {shortenHash(subject.address, 10, 6)}
                </span>
              </span>
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Kapan dan dari mana data kasus diambil, supaya investigasi bisa dibuka ulang dengan hasil sama. */
export function CaseSnapshotPanel({ item }: { item: InvestigationCase }) {
  const { snapshot } = item;
  return (
    <Panel id="snapshot" title="Snapshot data" description="Data yang dipakai kasus ini dibekukan pada titik ini." icon={Camera}>
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
            {snapshot.statusReason ? <p className="leading-relaxed text-muted">{snapshot.statusReason}</p> : null}
          </dd>
        </div>
      </dl>
      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Membuka ulang kasus memakai snapshot ini, jadi angkanya sama dengan saat disimpan. Data terbaru bisa berbeda.
      </p>
    </Panel>
  );
}

export function CaseStepsPanel({ item, now }: { item: InvestigationCase; now: Date }) {
  return (
    <Panel id="langkah" title="Langkah investigasi" description="Halaman yang dibuka untuk kasus ini." icon={History}>
      {item.steps.length === 0 ? (
        <EmptyState icon={History} title="Belum ada langkah" description="Halaman investigasi yang dibuka untuk kasus ini akan tercatat di sini." />
      ) : (
        <ol className="space-y-1">
          {item.steps.map((step) => {
            const meta = INVESTIGATION_KIND_META[step.kind];
            const Icon = meta.icon;
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="group flex items-start gap-2.5 rounded-lg p-2 transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium group-hover:text-accent">{step.title}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {meta.label} ·{" "}
                      <time dateTime={step.openedAt} title={formatDateTime(step.openedAt)}>
                        {formatRelativeTime(step.openedAt, now)}
                      </time>
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function CaseNotesPanel({ item }: { item: InvestigationCase }) {
  const notes = [...item.notes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <Panel id="catatan" title="Catatan pribadi" description="Hanya terlihat oleh kamu." icon={NotebookPen}>
      {notes.length === 0 ? (
        <EmptyState icon={NotebookPen} title="Belum ada catatan" description="Catatan yang kamu tulis untuk kasus ini akan muncul di sini." />
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-surface-raised px-3 py-2.5">
              <p className="whitespace-pre-line break-words text-xs leading-relaxed text-foreground/90">{note.body}</p>
              <time dateTime={note.createdAt} className="mt-1.5 block text-[11px] text-muted">
                {formatDateTime(note.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
