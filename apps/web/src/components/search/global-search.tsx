"use client";

import { CornerDownLeft, History, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { ChainBadge } from "@/components/badges";
import {
  listInvestigationHistory,
  MIN_TEXT_QUERY,
  searchPath,
  suggestSearch,
  type SearchSuggestions,
} from "@/lib/api/search";
import { cn } from "@/lib/cn";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { classifyQuery, diagnoseQuery, highlightMatch, moveActiveIndex, normalizeText, QUERY_KIND_LABEL } from "@/lib/search";
import type { InvestigationEntry, SearchResult } from "@/lib/types";
import { INVESTIGATION_KIND_META, RESULT_GROUPS } from "./kind-meta";

/** Jeda setelah berhenti mengetik sebelum meminta saran. */
const DEBOUNCE_MS = 200;
const HISTORY_LIMIT = 5;

type Option =
  | { type: "result"; result: SearchResult }
  | { type: "history"; entry: InvestigationEntry }
  | { type: "all"; query: string };

type Status = "idle" | "loading" | "ready" | "error";

function optionHref(option: Option): string {
  if (option.type === "result") return option.result.href;
  if (option.type === "history") return option.entry.href;
  return searchPath(option.query);
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightMatch(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-accent/20 text-foreground">
            {part.text}
          </mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

function SuggestionOption({
  id,
  selected,
  onSelect,
  onHover,
  children,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      // Cegah input kehilangan fokus sebelum klik diproses.
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={() => !selected && onHover()}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left",
        selected ? "bg-surface-raised ring-1 ring-line" : "hover:bg-surface-raised/60",
      )}
    >
      {children}
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

interface GlobalSearchProps {
  /** `header`: ringkas, tanpa tombol, menampilkan riwayat saat kosong. `page`: besar dengan tombol Cari. */
  variant: "header" | "page";
  defaultValue?: string;
  autoFocus?: boolean;
}

/**
 * Kolom pencarian dengan saran (pola combobox). Saran muncul saat mengetik,
 * bisa dipilih dengan panah dan Enter, dan Enter tanpa sorotan membuka
 * halaman hasil lengkap. Tekan "/" di mana saja untuk langsung ke kolom ini.
 * Tanpa JavaScript, kolom ini tetap formulir GET biasa ke /cari.
 */
export function GlobalSearch({ variant, defaultValue = "", autoFocus = false }: GlobalSearchProps) {
  const router = useRouter();
  const baseId = useId();
  const listId = `${baseId}-saran`;
  const inputId = `${baseId}-isian`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const requestRef = useRef(0);

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<Status>("idle");
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null);
  const [history, setHistory] = useState<InvestigationEntry[] | null>(null);

  const header = variant === "header";
  const query = value.trim();
  const queryKind = classifyQuery(query);

  // "/" memfokuskan kolom cari, kecuali saat sedang mengetik di kolom lain.
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  function requestSuggestions(next: string) {
    window.clearTimeout(timerRef.current);
    const id = ++requestRef.current;
    if (classifyQuery(next) === "empty") {
      setStatus("idle");
      setSuggestions(null);
      return;
    }
    setStatus("loading");
    timerRef.current = window.setTimeout(() => {
      suggestSearch(next).then(
        (response) => {
          if (requestRef.current !== id) return;
          setSuggestions(response);
          setStatus("ready");
          setActive(-1);
        },
        () => {
          if (requestRef.current !== id) return;
          setSuggestions(null);
          setStatus("error");
          setActive(-1);
        },
      );
    }, DEBOUNCE_MS);
  }

  function openList() {
    setOpen(true);
    if (header && history === null) {
      listInvestigationHistory().then(setHistory, () => setHistory([]));
    }
    if (query && status === "idle") requestSuggestions(value);
  }

  function close() {
    setOpen(false);
    setActive(-1);
  }

  // Hasil lama tetap tampil selama saran baru dimuat, supaya daftar tidak berkedip.
  const results = query && suggestions ? suggestions.results : [];
  const options: Option[] = query
    ? [...results.map((result) => ({ type: "result" as const, result })), { type: "all" as const, query }]
    : header
      ? (history ?? []).slice(0, HISTORY_LIMIT).map((entry) => ({ type: "history" as const, entry }))
      : [];
  const activeIndex = active < options.length ? active : -1;
  const tooShort = queryKind === "text" && normalizeText(query).length < MIN_TEXT_QUERY;
  const showList = open && options.length > 0;
  const optionId = (index: number) => `${baseId}-opsi-${index}`;

  function choose(option: Option) {
    close();
    inputRef.current?.blur();
    if (header) {
      setValue("");
      setSuggestions(null);
      setStatus("idle");
    } else if (option.type === "result" || option.type === "history") {
      setValue("");
    }
    router.push(optionHref(option));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActive(moveActiveIndex(activeIndex, event.key === "ArrowDown" ? 1 : -1, options.length));
    } else if (event.key === "Enter") {
      if (showList && activeIndex >= 0) {
        event.preventDefault();
        choose(options[activeIndex]);
      } else {
        close();
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      } else if (value) {
        event.preventDefault();
        setValue("");
        requestSuggestions("");
      }
    } else if (event.key === "Tab") {
      close();
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) close();
  }

  let liveMessage = "";
  if (open && query) {
    if (status === "error") liveMessage = "Saran tidak bisa dimuat. Tekan Enter untuk mencari.";
    else if (status === "ready" && suggestions) {
      liveMessage = suggestions.total > 0 ? `${suggestions.total} saran ditemukan` : "Belum ada saran yang cocok";
    }
  }

  // Hasil sudah urut per jenis (token, address, transaksi), jadi indeksnya sama dengan urutan tampil.
  const groups = RESULT_GROUPS.map((group) => ({
    ...group,
    items: results.flatMap((result, index) => (result.kind === group.kind ? [{ result, index }] : [])),
  }));

  return (
    <div ref={rootRef} onBlur={handleBlur} className={cn("relative min-w-0", header ? "w-full" : "")}>
      <Form action="/cari" role="search" aria-label={header ? "Cari cepat" : "Cari investigasi"} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Cari address, hash transaksi, atau nama token
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted", header ? "left-2.5 size-3.5" : "left-3 size-4")}
            aria-hidden
          />
          <input
            ref={inputRef}
            id={inputId}
            name="q"
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-keyshortcuts="/"
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            placeholder={header ? "Cari address, hash, atau token" : "0x…, address Solana, hash transaksi, atau nama token"}
            onChange={(event) => {
              setValue(event.target.value);
              setOpen(true);
              setActive(-1);
              requestSuggestions(event.target.value);
            }}
            onFocus={openList}
            onPointerDown={() => {
              // Buka lagi setelah ditutup dengan Escape tanpa kehilangan fokus.
              if (!open && document.activeElement === inputRef.current) openList();
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full rounded-lg border border-line bg-surface text-foreground placeholder:text-muted/80 focus:border-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-search-cancel-button]:hidden",
              header ? "h-8 pl-8 pr-8 text-xs" : "h-11 pl-9 pr-9 text-sm",
            )}
          />
          {status === "loading" && query ? (
            <LoaderCircle
              className={cn("absolute top-1/2 -translate-y-1/2 animate-spin text-muted", header ? "right-2.5 size-3.5" : "right-3 size-4")}
              aria-hidden
            />
          ) : !value ? (
            <kbd
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-muted sm:block",
                header ? "right-2" : "right-3",
              )}
            >
              /
            </kbd>
          ) : null}
        </div>
        {header ? null : (
          <button
            type="submit"
            className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cari
          </button>
        )}
      </Form>

      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {showList ? (
        <div
          className={cn(
            "absolute left-0 top-full z-30 mt-1.5 max-h-[min(70vh,30rem)] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/40",
            header ? "w-full min-w-[22rem]" : "right-0",
          )}
        >
          <div id={listId} role="listbox" aria-label="Saran pencarian">
            {query ? (
              <>
                {groups.map((group) =>
                  group.items.length === 0 ? null : (
                    <div key={group.kind} role="group" aria-labelledby={`${baseId}-grup-${group.kind}`} className="mb-1">
                      <p
                        id={`${baseId}-grup-${group.kind}`}
                        role="presentation"
                        className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
                      >
                        {group.title}
                      </p>
                      {group.items.map(({ result, index }) => {
                        const Icon = group.icon;
                        return (
                          <SuggestionOption
                            key={result.id}
                            id={optionId(index)}
                            selected={index === activeIndex}
                            onSelect={() => choose({ type: "result", result })}
                            onHover={() => setActive(index)}
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
                              <Icon className="size-3.5" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-xs font-medium">
                                  {queryKind === "text" ? <Highlighted text={result.title} query={query} /> : result.title}
                                </span>
                                {result.chain ? <ChainBadge chain={result.chain} /> : null}
                              </span>
                              <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">{result.subtitle}</span>
                            </span>
                          </SuggestionOption>
                        );
                      })}
                    </div>
                  ),
                )}
                {status === "loading" && results.length === 0 ? (
                  <p aria-hidden className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted">
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                    Mencari saran…
                  </p>
                ) : null}
                {status === "error" ? (
                  <p aria-hidden className="flex items-start gap-2 px-2.5 py-2 text-xs text-rose-300">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Saran tidak bisa dimuat. Kamu tetap bisa membuka pencarian lengkap.
                  </p>
                ) : null}
                {status === "ready" && results.length === 0 ? (
                  <p aria-hidden className="px-2.5 py-2 text-xs text-muted">
                    {tooShort
                      ? `Ketik minimal ${MIN_TEXT_QUERY} huruf untuk mencari nama.`
                      : (diagnoseQuery(query) ?? `Belum ada yang cocok untuk ${QUERY_KIND_LABEL[queryKind].toLowerCase()} ini.`)}
                  </p>
                ) : null}
                <div className="mt-1 border-t border-line pt-1">
                  <SuggestionOption
                    id={optionId(options.length - 1)}
                    selected={options.length - 1 === activeIndex}
                    onSelect={() => choose({ type: "all", query })}
                    onHover={() => setActive(options.length - 1)}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full text-accent">
                      <Search className="size-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      Lihat semua hasil untuk <span className="font-medium">“{query}”</span>
                    </span>
                    {suggestions && suggestions.total > results.length ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted">{formatNumber(suggestions.total)} hasil</span>
                    ) : (
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted" aria-hidden />
                    )}
                  </SuggestionOption>
                </div>
              </>
            ) : (
              <div role="group" aria-labelledby={`${baseId}-grup-riwayat`}>
                <p
                  id={`${baseId}-grup-riwayat`}
                  role="presentation"
                  className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
                >
                  <History className="size-3" aria-hidden />
                  Terakhir dibuka
                </p>
                {options.map((option, index) => {
                  if (option.type !== "history") return null;
                  const meta = INVESTIGATION_KIND_META[option.entry.kind];
                  const Icon = meta.icon;
                  return (
                    <SuggestionOption
                      key={option.entry.id}
                      id={optionId(index)}
                      selected={index === activeIndex}
                      onSelect={() => choose(option)}
                      onHover={() => setActive(index)}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-raised text-muted ring-1 ring-line">
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{option.entry.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted">
                          {meta.label} · {formatRelativeTime(option.entry.openedAt)}
                        </span>
                      </span>
                    </SuggestionOption>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
