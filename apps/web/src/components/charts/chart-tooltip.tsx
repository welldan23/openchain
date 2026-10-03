interface ChartTooltipProps {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Nilai utama, tampil paling menonjol. */
  value: string;
  label: string;
  detail?: string;
  /** Warna mark, dipakai sebagai garis kunci (bukan warna teks). */
  color: string;
}

/** Tooltip grafik: nilai di depan, nama seri sesudahnya dengan garis kunci warna. */
export function ChartTooltip({ id, x, y, width, value, label, detail, color }: ChartTooltipProps) {
  return (
    <div
      id={id}
      role="tooltip"
      style={{ left: x, top: y, width, transform: "translate(-50%, calc(-100% - 8px))" }}
      className="pointer-events-none absolute z-30 rounded-lg border border-line bg-surface-raised px-3 py-2 shadow-xl shadow-black/40"
    >
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground/80">
        <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </p>
      {detail ? <p className="mt-0.5 text-[11px] text-muted">{detail}</p> : null}
    </div>
  );
}
