"use client";

import { CircleCheck, FolderPlus, LoaderCircle, RotateCw, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { ChainBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { casePath, listCases, saveToCase, type SaveToCaseResult } from "@/lib/api/cases";
import { canSaveFinding, CASE_TITLE_MAX, validateCaseTitle } from "@/lib/cases";
import { cn } from "@/lib/cn";
import { formatRelativeTime, shortenHash } from "@/lib/format";
import { NOTE_MAX_LENGTH, validateNote } from "@/lib/history";
import type { CaseFinding, CaseSubject, CaseSummary } from "@/lib/types";
import { CaseStatusBadge } from "./case-badges";

const NEW_CASE = "__baru__";

const FIELD =
  "block w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs text-foreground placeholder:text-muted/70 focus:border-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60";

interface SaveToCaseButtonProps {
  subject: CaseSubject;
  /** Calon temuan; yang tanpa hash bukti tampil tapi tidak bisa dipilih. */
  findings?: CaseFinding[];
  /** Usulan judul bila membuat kasus baru. */
  suggestedTitle: string;
}

type CasesState = { status: "idle" | "loading" } | { status: "ready"; cases: CaseSummary[] } | { status: "error"; message: string };

/**
 * Tombol "Simpan ke kasus" beserta modalnya: pilih kasus tujuan (atau buat
 * baru), pilih temuan yang ikut disimpan, dan tambah catatan. Modal memakai
 * <dialog> bawaan, jadi fokus terkunci di dalamnya dan kembali ke tombol saat
 * ditutup.
 */
export function SaveToCaseButton({ subject, findings = [], suggestedTitle }: SaveToCaseButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const savable = findings.filter(canSaveFinding);

  const [cases, setCases] = useState<CasesState>({ status: "idle" });
  const [target, setTarget] = useState<string>(NEW_CASE);
  const [title, setTitle] = useState(suggestedTitle);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(savable.map((finding) => finding.id)));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveToCaseResult | null>(null);
  const [saving, startSaving] = useTransition();

  function loadCases() {
    setCases({ status: "loading" });
    listCases().then(
      (list) => {
        setCases({ status: "ready", cases: list });
        // Kasus terbaru jadi pilihan awal; kasus baru bila belum ada kasus sama sekali.
        setTarget((current) => (current === NEW_CASE && list.length > 0 ? list[0].id : current));
      },
      (cause: unknown) => setCases({ status: "error", message: cause instanceof Error ? cause.message : "Daftar kasus gagal dimuat." }),
    );
  }

  function open() {
    setError(null);
    setResult(null);
    setTarget(NEW_CASE);
    setTitle(suggestedTitle);
    setSelected(new Set(savable.map((finding) => finding.id)));
    setNote("");
    loadCases();
    dialogRef.current?.showModal();
  }

  function close() {
    if (!saving) dialogRef.current?.close();
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    if (target === NEW_CASE) {
      const validation = validateCaseTitle(title);
      if (!validation.ok) return setError(validation.error);
    }
    const noteValidation = validateNote(note);
    if (!noteValidation.ok) return setError(noteValidation.error);
    startSaving(async () => {
      try {
        const saved = await saveToCase({
          target: target === NEW_CASE ? { kind: "new", title } : { kind: "existing", caseId: target },
          subject,
          findings: savable.filter((finding) => selected.has(finding.id)),
          note,
        });
        setResult(saved);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Gagal menyimpan ke kasus.");
      }
    });
  }

  const titleId = `${baseId}-judul`;
  const selectedCount = savable.filter((finding) => selected.has(finding.id)).length;
  const noteTooLong = note.trim().length > NOTE_MAX_LENGTH;

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <FolderPlus className="size-3.5" aria-hidden />
        Simpan ke kasus
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          // Esc tidak menutup modal selagi menyimpan.
          if (saving) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-0 text-foreground shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-raised text-accent ring-1 ring-line">
              <FolderPlus className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold">
                Simpan ke kasus
              </h2>
              <p className="mt-0.5 text-xs text-muted">Objek dan temuan disimpan bersama snapshot data saat ini.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            aria-label="Tutup modal"
            className="inline-grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {result ? (
          <SaveResult result={result} onClose={close} />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="space-y-5 px-4 py-4 sm:px-5"
            aria-busy={saving}
          >
            <section aria-labelledby={`${baseId}-objek`}>
              <h3 id={`${baseId}-objek`} className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Objek
              </h3>
              <div className="mt-2 rounded-lg bg-surface-raised px-3 py-2.5">
                <p className="truncate text-sm font-medium">{subject.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  {subject.kind === "token" ? "Token" : "Address"}
                  {subject.chain ? <ChainBadge chain={subject.chain} /> : <span>· semua chain EVM</span>}
                  <span className="font-mono" title={subject.address}>
                    {shortenHash(subject.address, 8, 6)}
                  </span>
                </p>
              </div>
            </section>

            {findings.length > 0 ? (
              <fieldset>
                <legend className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <span>
                    Temuan ({selectedCount} dari {savable.length} dipilih)
                  </span>
                  {savable.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setSelected(selectedCount === savable.length ? new Set() : new Set(savable.map((finding) => finding.id)))}
                      className="rounded text-[11px] font-normal normal-case tracking-normal text-muted underline-offset-2 hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {selectedCount === savable.length ? "Kosongkan" : "Pilih semua"}
                    </button>
                  ) : null}
                </legend>
                <ul className="mt-2 space-y-1.5">
                  {findings.map((finding) => {
                    const allowed = canSaveFinding(finding);
                    const inputId = `${baseId}-temuan-${finding.id}`;
                    return (
                      <li key={finding.id}>
                        <label
                          htmlFor={inputId}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border border-line px-3 py-2",
                            allowed ? "cursor-pointer hover:border-accent/40" : "cursor-not-allowed opacity-60",
                          )}
                        >
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={allowed && selected.has(finding.id)}
                            disabled={!allowed || saving}
                            onChange={() => toggle(finding.id)}
                            className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-medium">{finding.title}</span>
                              <ClassificationBadge classification={finding.classification} interactive={false} />
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted">
                              {allowed
                                ? `${finding.evidenceTxHashes.length} hash bukti`
                                : "Belum punya hash bukti, jadi tidak bisa disimpan sebagai temuan kasus."}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ) : null}

            <fieldset>
              <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted">Kasus tujuan</legend>
              <div className="mt-2 space-y-1.5">
                {cases.status === "loading" || cases.status === "idle" ? (
                  <p className="flex items-center gap-2 px-1 py-1.5 text-xs text-muted" role="status">
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                    Memuat daftar kasus…
                  </p>
                ) : null}
                {cases.status === "error" ? (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-400/25 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                    <span>{cases.message} Kamu tetap bisa membuat kasus baru.</span>
                    <button
                      type="button"
                      onClick={loadCases}
                      className="inline-flex items-center gap-1 rounded text-[11px] text-foreground/90 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <RotateCw className="size-3" aria-hidden />
                      Coba lagi
                    </button>
                  </div>
                ) : null}
                {cases.status === "ready"
                  ? cases.cases.map((item) => (
                      <TargetOption key={item.id} name={`${baseId}-tujuan`} value={item.id} checked={target === item.id} disabled={saving} onSelect={setTarget}>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium">{item.title}</span>
                          <CaseStatusBadge status={item.status} />
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {item.findingCount} temuan · diperbarui {formatRelativeTime(item.updatedAt)}
                        </span>
                      </TargetOption>
                    ))
                  : null}
                <TargetOption
                  name={`${baseId}-tujuan`}
                  value={NEW_CASE}
                  checked={target === NEW_CASE}
                  disabled={saving}
                  onSelect={setTarget}
                  extra={
                    target === NEW_CASE ? (
                      <div className="mt-2">
                        <label htmlFor={`${baseId}-judul-kasus`} className="mb-1 block text-[11px] text-muted">
                          Judul kasus
                        </label>
                        <input
                          id={`${baseId}-judul-kasus`}
                          value={title}
                          maxLength={CASE_TITLE_MAX + 20}
                          disabled={saving}
                          onChange={(event) => setTitle(event.target.value)}
                          className={FIELD}
                        />
                      </div>
                    ) : null
                  }
                >
                  <span className="text-xs font-medium">Kasus baru</span>
                </TargetOption>
              </div>
            </fieldset>

            <div>
              <label htmlFor={`${baseId}-catatan`} className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Catatan (opsional)
              </label>
              <textarea
                id={`${baseId}-catatan`}
                rows={2}
                value={note}
                disabled={saving}
                onChange={(event) => setNote(event.target.value)}
                aria-invalid={noteTooLong}
                placeholder="Mis. kenapa objek ini disimpan."
                className={cn(FIELD, "mt-2 resize-y leading-relaxed", noteTooLong && "border-rose-400/60")}
              />
              <p className={cn("mt-1 text-right text-[11px] tabular-nums", noteTooLong ? "text-rose-300" : "text-muted")}>
                {note.trim().length}/{NOTE_MAX_LENGTH}
              </p>
            </div>

            {error ? (
              <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-xs text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving || noteTooLong}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

function TargetOption({
  name,
  value,
  checked,
  disabled,
  onSelect,
  children,
  extra,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  onSelect: (value: string) => void;
  children: ReactNode;
  /** Isian tambahan di luar label, mis. judul kasus baru. */
  extra?: ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2 transition", checked ? "border-accent/50 bg-accent/5" : "border-line")}>
      <input
        id={`${name}-${value}`}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent)]"
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={`${name}-${value}`} className="block cursor-pointer">
          {children}
        </label>
        {extra}
      </div>
    </div>
  );
}

function SaveResult({ result, onClose }: { result: SaveToCaseResult; onClose: () => void }) {
  const findingsText =
    result.addedFindings === 0 && result.skippedFindings === 0
      ? "Tidak ada temuan yang dipilih."
      : `${result.addedFindings} temuan ditambahkan${result.skippedFindings > 0 ? `, ${result.skippedFindings} sudah ada di kasus` : ""}.`;
  return (
    <div className="px-4 py-5 sm:px-5">
      <div role="status">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <CircleCheck className="size-4" aria-hidden />
          {result.created ? "Kasus baru dibuat" : "Tersimpan ke kasus"}
        </p>
        <p className="mt-1 text-sm">“{result.caseTitle}”</p>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-foreground/85" aria-label="Rincian penyimpanan">
        <li>{result.subjectAdded ? "Objek ditambahkan ke kasus." : "Objek sudah ada di kasus, tidak digandakan."}</li>
        <li>{findingsText}</li>
        {result.noteAdded ? <li>Catatan ditambahkan.</li> : null}
      </ul>
      {result.created ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Data tiruan: kasus baru belum benar-benar tersimpan, jadi belum muncul di daftar kasus.
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-xs text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          Tutup
        </button>
        {result.created ? null : (
          <Link
            href={casePath(result.caseId)}
            className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Buka kasus
          </Link>
        )}
      </div>
    </div>
  );
}
