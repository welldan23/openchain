"use client";

import { Lock } from "lucide-react";
import { useRef, useState } from "react";
import { ChainBadge } from "@/components/badges";
import { FormAlert } from "@/components/auth/form-parts";
import { Badge } from "@/components/ui/badge";
import { setDataSourceEnabled } from "@/lib/api/settings";
import { cn } from "@/lib/cn";
import { DATA_SOURCE_KIND_META, DATA_SOURCE_STATUS_META } from "@/lib/labels";
import { dataSourceCounts, inactiveKinds, withSourceEnabled } from "@/lib/settings";
import type { DataSourceSetting, DataSourceStatus } from "@/lib/types";

const SUMMARY: DataSourceStatus[] = ["ok", "degraded", "down", "unknown", "disabled", "not_integrated"];

/**
 * Daftar sumber data dengan saklar nyala/mati per akun. Perubahan langsung
 * tampil dan dikembalikan bila gagal disimpan. Urutan tidak berubah saat
 * saklar diganti supaya kartu tidak melompat. Teks waktu sudah diformat di
 * server.
 */
export function DataSourceList({ initial, checkedLabels }: { initial: DataSourceSetting[]; checkedLabels: Record<string, string> }) {
  const [sources, setSources] = useState(initial);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  // Kondisi hasil pemeriksaan terakhir, dipakai lagi saat sumber dinyalakan kembali.
  const checkedStatus = useRef(new Map(initial.map((source) => [source.id, source.status === "disabled" ? "ok" : source.status])));
  const counts = dataSourceCounts(sources);
  const missing = inactiveKinds(sources.filter((source) => source.status !== "not_integrated"));

  async function toggle(source: DataSourceSetting) {
    const enabled = !source.enabled;
    const statusWhenOn = checkedStatus.current.get(source.id) ?? "ok";
    setError(null);
    setSources((current) => withSourceEnabled(current, source.id, enabled, statusWhenOn));
    setPending((current) => new Set(current).add(source.id));
    try {
      await setDataSourceEnabled(source, enabled, statusWhenOn);
      setStatus(`${source.name} ${enabled ? "dinyalakan" : "dimatikan"}.`);
    } catch (cause) {
      setSources((current) => withSourceEnabled(current, source.id, source.enabled, statusWhenOn));
      setError(cause instanceof Error ? cause.message : "Pengaturan sumber data gagal disimpan.");
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(source.id);
        return next;
      });
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <ul aria-label="Ringkasan kondisi sumber data" className="flex flex-wrap gap-1.5">
        {SUMMARY.filter((item) => counts[item] > 0).map((item) => (
          <li key={item}>
            <Badge className={DATA_SOURCE_STATUS_META[item].className}>
              {DATA_SOURCE_STATUS_META[item].label} <span className="tabular-nums">{counts[item]}</span>
            </Badge>
          </li>
        ))}
      </ul>
      {missing.length > 0 ? (
        <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Tidak ada sumber aktif untuk {missing.map((kind) => DATA_SOURCE_KIND_META[kind].label.toLowerCase()).join(", ")}; data jenis itu akan ditandai tidak tersedia di
          analisis.
        </p>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <ul className="space-y-3">
        {sources.map((source) => {
          const meta = DATA_SOURCE_STATUS_META[source.status];
          const busy = pending.has(source.id);
          const switchId = `sumber-${source.id}`;
          return (
            <li key={source.id} className={cn("rounded-lg border border-line p-3 sm:p-4", !source.enabled && "bg-surface-raised/50")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p id={`${switchId}-nama`} className="text-sm font-medium text-foreground">
                      {source.name}
                    </p>
                    <Badge className={meta.className} title={meta.description}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {DATA_SOURCE_KIND_META[source.kind].label}: {DATA_SOURCE_KIND_META[source.kind].description}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={source.enabled}
                  aria-labelledby={`${switchId}-nama`}
                  aria-describedby={`${switchId}-akibat`}
                  disabled={busy || source.lockedReason !== null}
                  onClick={() => toggle(source)}
                  title={source.lockedReason ?? (source.enabled ? "Matikan untuk analisis saya" : "Nyalakan untuk analisis saya")}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60",
                    source.enabled ? "bg-accent ring-accent" : "bg-surface-raised ring-line",
                  )}
                >
                  <span aria-hidden className={cn("inline-block size-4 rounded-full bg-foreground shadow transition", source.enabled ? "translate-x-6 bg-background" : "translate-x-1")} />
                </button>
              </div>
              <p className="mt-2 text-sm text-foreground/90">{source.status === "disabled" ? "Dimatikan untuk analisis akun ini." : source.statusNote}</p>
              <p id={`${switchId}-akibat`} className="mt-1 flex items-start gap-1.5 text-xs text-muted">
                {source.lockedReason ? <Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> : null}
                <span>{source.lockedReason ?? `Bila dimatikan: ${source.offEffect}`}</span>
              </p>
              {source.chains.length > 0 ? (
                <ul aria-label={`Chain yang dilayani ${source.name}`} className="mt-2 flex flex-wrap gap-1">
                  {source.chains.map((chain) => (
                    <li key={chain}>
                      <ChainBadge chain={chain} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {source.envVars.length > 0 ? (
                <dl className="mt-3 space-y-1.5 border-t border-line pt-2.5">
                  {source.envVars.map((env) => (
                    <div key={env.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                      <dt className="font-mono text-foreground">{env.name}</dt>
                      <dd className="text-muted">
                        {env.required ? "wajib" : "opsional"} · {env.configured ? "sudah diisi" : "belum diisi"} — {env.purpose}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="mt-2 text-[11px] text-muted">{checkedLabels[source.id]}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
