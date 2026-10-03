import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface BadgeProps {
  /** Kelas warna (latar, teks, ring) dari peta meta di `lib/labels`. */
  className?: string;
  title?: string;
  children: ReactNode;
}

export function Badge({ className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        className ?? "bg-slate-500/20 text-slate-300 ring-slate-400/30",
      )}
    >
      {children}
    </span>
  );
}
