"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string;
  /** Petunjuk di bawah kolom, mis. syarat kata sandi. */
  hint?: ReactNode;
}

/** Kolom form akun: label, galat per kolom yang dibacakan pembaca layar, dan tombol lihat kata sandi. */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField({ id, label, error, hint, type = "text", className, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  const describedBy = [hint ? `${id}-petunjuk` : null, error ? `${id}-galat` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-foreground">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          ref={ref}
          id={id}
          type={password && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "block w-full rounded-lg border bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60",
            error ? "border-rose-400/60" : "border-line focus:border-accent/60",
            password && "pr-10",
          )}
          {...props}
        />
        {password ? (
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        ) : null}
      </div>
      {hint ? (
        <div id={`${id}-petunjuk`} className="mt-1 text-[11px] text-muted">
          {hint}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-galat`} className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
});
