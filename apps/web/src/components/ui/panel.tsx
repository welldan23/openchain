import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PanelProps {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Elemen di kanan judul, mis. badge atau tombol. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({ id, title, description, icon: Icon, action, className, children }: PanelProps) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("scroll-mt-20 rounded-xl border border-line bg-surface", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-raised text-accent ring-1 ring-line">
              <Icon className="size-4" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
