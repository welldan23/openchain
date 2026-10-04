"use client";

import { Check, FileSearch, ListPlus, Search, Target, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChainBadge, EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { cn } from "@/lib/cn";
import { shortenHash } from "@/lib/format";
import { matchesPickerQuery, pickerItems } from "@/lib/report-picker";
import type { InvestigationCase, InvestigationReport } from "@/lib/types";

export interface PickerSelection {
  subjectKeys: string[];
  findingIds: string[];
}

function Row({
  checked,
  disabled,
  onToggle,
  children,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <label
        className={cn(
          "flex gap-3 rounded-lg border p-3 transition",
          disabled ? "cursor-not-allowed border-line opacity-60" : "cursor-pointer hover:border-accent/50",
          checked && !disabled ? "border-accent/60 bg-accent/5" : "border-line",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span className="min-w-0 flex-1">{children}</span>
      </label>
    </li>
  );
}

/**
 * Tombol dan dialog untuk memilih entitas dan temuan dari kasus sumber.
 * Yang sudah ada di laporan tampil tercentang dan tidak bisa dipilih ulang.
 */
export function ReportPicker({
  report,
  source,
  onAdd,
}: {
  report: InvestigationReport;
  source: InvestigationCase;
  onAdd: (selection: PickerSelection) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [subjectKeys, setSubjectKeys] = useState<string[]>([]);
  const [findingIds, setFindingIds] = useState<string[]>([]);
  const items = useMemo(() => pickerItems(source, report), [source, report]);
  const available = items.subjects.filter((item) => !item.inReport).length + items.findings.filter((item) => !item.inReport).length;

  const subjects = items.subjects.filter(({ subject }) => matchesPickerQuery(query, subject.title, subject.address, subject.label?.name, subject.kind === "token" ? "token" : "address wallet"));
  const findings = items.findings.filter(({ finding }) => matchesPickerQuery(query, finding.title, finding.detail));
  const selectedCount = subjectKeys.length + findingIds.length;

  const toggle = (list: string[], set: (next: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);

  function open() {
    setQuery("");
    setSubjectKeys([]);
    setFindingIds([]);
    dialogRef.current?.showModal();
  }

  function submit() {
    onAdd({ subjectKeys, findingIds });
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ListPlus className="size-3.5" aria-hidden />
        Pilih entitas &amp; temuan
        <span className="rounded-full bg-surface-raised px-1.5 text-[10px] tabular-nums text-muted ring-1 ring-line">{available}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-line bg-surface p-0 text-foreground shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold">
                Pilih entitas &amp; temuan
              </h2>
              <p className="mt-0.5 text-xs text-muted">Dari kasus: {source.title}</p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Tutup pemilih"
              className="inline-grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="border-b border-line px-4 py-3 sm:px-5">
            <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 focus-within:border-accent/60">
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">Cari entitas atau temuan</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari judul, address, atau label…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </label>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
            <section aria-labelledby={`${titleId}-entitas`}>
              <h3 id={`${titleId}-entitas`} className="flex items-center gap-1.5 text-xs font-semibold">
                <Target className="size-3.5 text-accent" aria-hidden />
                Entitas ({subjects.length})
              </h3>
              {subjects.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Tidak ada entitas yang cocok.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {subjects.map(({ key, subject, inReport }) => (
                    <Row
                      key={key}
                      checked={inReport || subjectKeys.includes(key)}
                      disabled={inReport}
                      onToggle={() => toggle(subjectKeys, setSubjectKeys, key)}
                    >
                      <span className="block text-sm font-medium">{subject.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {subject.kind === "token" ? "Token" : "Address"}
                        {subject.chain ? <ChainBadge chain={subject.chain} /> : <span>· semua chain EVM</span>}
                        {subject.label ? <EntityLabelBadge label={subject.label} interactive={false} /> : null}
                        <span className="font-mono">{shortenHash(subject.address)}</span>
                        {inReport ? <span className="text-accent">· sudah di laporan</span> : null}
                      </span>
                    </Row>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby={`${titleId}-temuan`}>
              <h3 id={`${titleId}-temuan`} className="flex items-center gap-1.5 text-xs font-semibold">
                <FileSearch className="size-3.5 text-accent" aria-hidden />
                Temuan ({findings.length})
              </h3>
              {findings.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Tidak ada temuan yang cocok.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {findings.map(({ key, finding, inReport, evidenceCount, storedCount }) => (
                    <Row
                      key={key}
                      checked={inReport || findingIds.includes(key)}
                      disabled={inReport}
                      onToggle={() => toggle(findingIds, setFindingIds, key)}
                    >
                      <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="text-sm font-medium">{finding.title}</span>
                        <ClassificationBadge classification={finding.classification} interactive={false} />
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">{finding.detail}</span>
                      <span className="mt-1.5 block text-[11px] text-muted">
                        {evidenceCount} hash bukti
                        {storedCount < evidenceCount ? ` · ${evidenceCount - storedCount} tanpa rincian tersimpan` : " · semua rinciannya tersimpan"}
                        {inReport ? <span className="text-accent"> · sudah di laporan</span> : null}
                      </span>
                    </Row>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
            <p className="text-[11px] text-muted">Provider dan waktu data diambil dari snapshot kasus.</p>
            <button
              type="button"
              onClick={submit}
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition enabled:hover:bg-accent/90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Check className="size-3.5" aria-hidden />
              {selectedCount === 0 ? "Pilih dulu" : `Tambahkan ${selectedCount} item`}
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
