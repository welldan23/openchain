"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/clipboard";

type CopyStatus = "idle" | "copied" | "error";

interface CopyButtonProps {
  value: string;
  /** Teks aksi, mis. "Salin hash". Jadi aria-label pada varian ikon. */
  label?: string;
  /** `icon`: tombol ikon kecil (default). `labeled`: tombol dengan teks. */
  variant?: "icon" | "labeled";
}

const STATUS_TEXT: Record<Exclude<CopyStatus, "idle">, string> = {
  copied: "Tersalin",
  error: "Gagal menyalin",
};

export function CopyButton({ value, label = "Salin", variant = "icon" }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 1800);
    return () => clearTimeout(timer);
  }, [status]);

  async function handleCopy() {
    setStatus((await copyText(value)) ? "copied" : "error");
  }

  const Icon = status === "copied" ? Check : status === "error" ? X : Copy;
  const iconClass = cn(
    "size-3.5 shrink-0",
    status === "copied" && "text-emerald-400",
    status === "error" && "text-rose-400",
  );
  const text = status === "idle" ? label : STATUS_TEXT[status];

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={text}
          title={text}
          className="inline-grid size-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon className={iconClass} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon className={iconClass} aria-hidden />
          {text}
        </button>
      )}
      {/* Umumkan hasil salin ke pembaca layar. */}
      <span role="status" aria-live="polite" className="sr-only">
        {status === "idle" ? "" : STATUS_TEXT[status]}
      </span>
    </>
  );
}
