"use client";

import { LoaderCircle, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { saveInvestigationNote } from "@/lib/api/search";
import { cn } from "@/lib/cn";
import { NOTE_MAX_LENGTH, validateNote } from "@/lib/history";
import type { InvestigationEntry } from "@/lib/types";

const LINK_BUTTON =
  "inline-flex items-center gap-1 rounded text-[11px] text-muted underline-offset-2 transition hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50";

interface NoteEditorProps {
  entry: InvestigationEntry;
  onSaved: (entry: InvestigationEntry) => void;
}

/**
 * Catatan satu investigasi: tampil sebagai teks, bisa ditambah, diubah, atau
 * dihapus. Tidak ada yang berubah di layar sampai penyimpanan berhasil.
 */
export function NoteEditor({ entry, onSaved }: NoteEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, startSaving] = useTransition();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const fieldId = useId();
  const errorId = `${fieldId}-galat`;
  const countId = `${fieldId}-hitung`;
  // Setelah simpan/batal/hapus, fokus kembali ke tombol ubah supaya pengguna keyboard tidak tersesat.
  const restoreFocusRef = useRef(false);
  const length = draft.trim().length;

  useEffect(() => {
    // Tunggu sampai penyimpanan selesai: tombol masih nonaktif selama `saving`.
    if (editing || saving || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    editButtonRef.current?.focus();
  }, [editing, saving, entry.note]);
  const tooLong = length > NOTE_MAX_LENGTH;

  function startEditing() {
    setDraft(entry.note ?? "");
    setError(null);
    setStatus("");
    setEditing(true);
  }

  function cancel() {
    restoreFocusRef.current = true;
    setEditing(false);
    setError(null);
  }

  function save(value: string) {
    const validation = validateNote(value);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError(null);
    startSaving(async () => {
      try {
        const saved = await saveInvestigationNote(entry.id, value);
        restoreFocusRef.current = true;
        onSaved(saved);
        setEditing(false);
        setStatus(saved.note ? "Catatan disimpan." : "Catatan dihapus.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Catatan gagal disimpan.");
      }
    });
  }

  return (
    <div className="mt-2">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(draft);
          }}
          className="space-y-2"
        >
          <label htmlFor={fieldId} className="sr-only">
            Catatan untuk {entry.title}
          </label>
          <textarea
            id={fieldId}
            autoFocus
            value={draft}
            rows={3}
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                save(draft);
              }
            }}
            aria-invalid={tooLong || error !== null}
            aria-describedby={`${countId}${error ? ` ${errorId}` : ""}`}
            placeholder="Mis. apa yang perlu dicek lagi, atau temuan penting dari investigasi ini."
            className={cn(
              "block w-full resize-y rounded-lg border bg-surface-raised px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60",
              tooLong ? "border-rose-400/60" : "border-line focus:border-accent/60",
            )}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={countId} className={cn("text-[11px] tabular-nums", tooLong ? "text-rose-300" : "text-muted")}>
              {length}/{NOTE_MAX_LENGTH}
              <span className="ml-2 hidden text-muted sm:inline">Ctrl+Enter untuk simpan, Esc untuk batal</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving || tooLong}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-[11px] text-rose-300">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="space-y-1.5">
          {entry.note ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-surface-raised px-2.5 py-2 text-xs leading-relaxed text-foreground/85">
              <NotebookPen className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 whitespace-pre-line break-words">{entry.note}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button ref={editButtonRef} type="button" onClick={startEditing} disabled={saving} className={LINK_BUTTON}>
              {entry.note ? <Pencil className="size-3" aria-hidden /> : <Plus className="size-3" aria-hidden />}
              {entry.note ? "Ubah catatan" : "Tambah catatan"}
              <span className="sr-only"> untuk {entry.title}</span>
            </button>
            {entry.note ? (
              <button type="button" onClick={() => save("")} disabled={saving} className={LINK_BUTTON}>
                {saving ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : <Trash2 className="size-3" aria-hidden />}
                Hapus catatan
                <span className="sr-only"> untuk {entry.title}</span>
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-[11px] text-rose-300">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
