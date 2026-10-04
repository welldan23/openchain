import { cn } from "@/lib/cn";
import { RISK_LEVEL_META } from "@/lib/labels";
import { RISK_BANDS, scorePosition } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";

/**
 * Skala skor risiko 0–100 yang dibagi empat rentang: rendah, sedang, tinggi,
 * kritis. Rentang yang memuat skor diberi warna penuh dan penanda posisi
 * skor; tingkatnya selalu ditulis, jadi tidak bergantung warna saja. Tanpa
 * skor, semua rentang redup dan tertulis "Belum dinilai".
 */
export function RiskScoreScale({ score, level, className }: { score: number | null; level: RiskLevel; className?: string }) {
  const meta = RISK_LEVEL_META[level];
  const rated = score !== null && level !== "unknown";
  const position = rated ? scorePosition(score) : null;
  return (
    <div className={cn("w-full", className)}>
      <div
        role="meter"
        aria-label="Skor risiko"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score ?? 0}
        aria-valuetext={rated ? `${score} dari 100, ${meta.label.toLowerCase()}` : "Belum dinilai"}
        className="relative"
      >
        <div className="flex gap-0.5">
          {RISK_BANDS.map((band) => {
            const active = rated && band.level === level;
            return (
              <div
                key={band.level}
                style={{ flexGrow: band.max - band.min + 1 }}
                className={cn(
                  "h-2 basis-0 first:rounded-l-full last:rounded-r-full",
                  rated ? RISK_LEVEL_META[band.level].barClass : "bg-surface-raised",
                  rated && !active && "opacity-25",
                )}
              />
            );
          })}
        </div>
        {position !== null ? (
          <span
            aria-hidden
            className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-surface"
            style={{ left: `${position}%` }}
          />
        ) : null}
      </div>
      <ol aria-hidden className="mt-1.5 flex gap-0.5 text-[10px] leading-tight">
        {RISK_BANDS.map((band) => (
          <li
            key={band.level}
            style={{ flexGrow: band.max - band.min + 1 }}
            className={cn("basis-0 truncate", rated && band.level === level ? "font-medium text-foreground" : "text-muted")}
          >
            {band.label} <span className="tabular-nums">{band.min}–{band.max}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Skor ringkas untuk daftar, mis. "68 · Risiko tinggi"; tanpa skor tertulis "Belum dinilai". */
export function RiskScoreBadge({ score, level }: { score: number | null; level: RiskLevel }) {
  const meta = RISK_LEVEL_META[level];
  return (
    <span
      title={score === null ? "Data belum cukup untuk dinilai" : `Skor risiko ${score} dari 100`}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        meta.className,
      )}
    >
      {score === null ? null : (
        <>
          <span className="tabular-nums">{score}</span>
          <span aria-hidden>·</span>
        </>
      )}
      {meta.label}
    </span>
  );
}

/** Angka skor besar dengan skala di sebelahnya, untuk kepala panel risiko. */
export function RiskScoreSummary({ score, level, note }: { score: number | null; level: RiskLevel; note: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <p className="shrink-0">
        <span className="text-3xl font-semibold tracking-tight">{score === null ? "–" : score}</span>
        <span className="text-sm text-muted">/100</span>
      </p>
      <div className="min-w-0 flex-1">
        <RiskScoreScale score={score} level={level} />
        <p className="mt-2 text-xs leading-relaxed text-muted">{note}</p>
      </div>
    </div>
  );
}
