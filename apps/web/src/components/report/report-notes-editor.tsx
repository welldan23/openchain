"use client";

import { NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NOTE_MAX_LENGTH } from "@/lib/history";
import type { ReportBlock } from "@/lib/types";

type NoteBlock = Extract<ReportBlock, { kind: "note" }>;
export type ClaimOption = { blockId: string; title: string };
/** Kembalikan pesan galat, atau `null` bila berhasil. */
type Submit = (body: string, claimBlockId: string | null) => string | null;

const LINK_BUTTON =
  "inline-flex items-center gap-1 rounded text-[11px] text-muted underline-offset-2 transition hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent";

function NoteForm({
  label,
  initialBody = "",
  initialClaim = null,
  claims,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  label: string;
  initialBody?: string;
  initialClaim?: string | null;
  claims: ClaimOption[];
  submitLabel: string;
  onSubmit: Submit;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [claim, setClaim] = useState<string>(initialClaim ?? "");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const length = body.trim().length;
  const tooLong = length > NOTE_MAX_LENGTH;

  function submit() {
    const failure = onSubmit(body, claim || null);
    setError(failure);
    if (!failure && !onCancel) {
      setBody("");
      setClaim("");
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <textarea
        id={fieldId}
        autoFocus={autoFocus}
        value={body}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && onCancel) {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
        aria-invalid={tooLong || error !== null}
        aria-describedby={`${fieldId}-hitung${error ? ` ${fieldId}-galat` : ""}`}
        placeholder="Mis. apa yang perlu dicek lagi, keraguan, atau konteks yang tidak terlihat on-chain."
        className={cn(
          "block w-full resize-y rounded-lg border bg-surface-raised px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          tooLong ? "border-rose-400/60" : "border-line focus:border-accent/60",
        )}
      />
      {claims.length > 0 ? (
        <label className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          Terkait klaim
          <select
            value={claim}
            onChange={(event) => setClaim(event.target.value)}
            className="max-w-full min-w-0 flex-1 rounded-md border border-line bg-surface-raised px-2 py-1 text-[11px] text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value="">Tidak terkait klaim tertentu</option>
            {claims.map((option) => (
              <option key={option.blockId} value={option.blockId}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${fieldId}-hitung`} className={cn("text-[11px] tabular-nums", tooLong ? "text-rose-300" : "text-muted")}>
          {length}/{NOTE_MAX_LENGTH}
          <span className="ml-2 hidden text-muted sm:inline">Ctrl+Enter untuk simpan{onCancel ? ", Esc untuk batal" : ""}</span>
        </p>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">
              Batal
            </button>
          ) : null}
          <button
            type="submit"
            disabled={tooLong || length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background transition enabled:hover:bg-accent/90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {submitLabel}
          </button>
        </div>
      </div>
      {error ? (
        <p id={`${fieldId}-galat`} role="alert" className="text-[11px] text-rose-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** Formulir catatan baru, di akhir bagian catatan (atau sendiri bila bagiannya belum ada). */
export function NoteComposer({ claims, onAdd, standalone = false }: { claims: ClaimOption[]; onAdd: Submit; standalone?: boolean }) {
  const form = <NoteForm label="Catatan investigasi baru" claims={claims} submitLabel="Tambah catatan" onSubmit={onAdd} />;
  if (!standalone) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-line p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <Plus className="size-3.5" aria-hidden />
          Tambah catatan
        </p>
        {form}
      </div>
    );
  }
  return (
    <section aria-labelledby="catatan-baru-title" className="rounded-xl border border-dashed border-line bg-surface p-4 sm:p-5">
      <h2 id="catatan-baru-title" className="flex items-center gap-2 text-base font-semibold">
        <NotebookPen className="size-4 text-accent" aria-hidden />
        Catatan investigasi
      </h2>
      <p className="mt-1 text-xs text-muted">Laporan ini belum punya catatan. Catatan pertama akan membuat bagiannya.</p>
      <div className="mt-3">{form}</div>
    </section>
  );
}

/** Catatan yang bisa diubah atau dihapus; hapus perlu konfirmasi. */
export function EditableNote({
  block,
  view,
  claims,
  onSave,
  onRemove,
}: {
  block: NoteBlock;
  view: ReactNode;
  claims: ClaimOption[];
  onSave: Submit;
  onRemove: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");

  if (mode === "edit") {
    return (
      <div className="rounded-lg border border-accent/40 p-3">
        <NoteForm
          label="Ubah catatan investigasi"
          initialBody={block.body}
          initialClaim={block.claimBlockId ?? null}
          claims={claims}
          submitLabel="Simpan"
          autoFocus
          onSubmit={(body, claim) => {
            const failure = onSave(body, claim);
            if (!failure) setMode("view");
            return failure;
          }}
          onCancel={() => setMode("view")}
        />
      </div>
    );
  }

  return (
    <div>
      {view}
      <div className="mt-1.5 flex flex-wrap items-center gap-3 px-1">
        {mode === "confirm" ? (
          <>
            <span className="text-[11px] text-foreground/85">Hapus catatan ini?</span>
            <button type="button" onClick={onRemove} className={cn(LINK_BUTTON, "text-rose-300")}>
              Ya, hapus
            </button>
            <button type="button" onClick={() => setMode("view")} className={LINK_BUTTON}>
              Batal
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setMode("edit")} className={LINK_BUTTON}>
              <Pencil className="size-3" aria-hidden />
              Ubah
            </button>
            <button type="button" onClick={() => setMode("confirm")} className={LINK_BUTTON}>
              <Trash2 className="size-3" aria-hidden />
              Hapus
            </button>
          </>
        )}
      </div>
    </div>
  );
}
