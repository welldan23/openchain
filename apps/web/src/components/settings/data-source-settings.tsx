import { DatabaseZap, KeyRound } from "lucide-react";
import { ChainBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { formatDateTime } from "@/lib/format";
import { DATA_SOURCE_KIND_META, DATA_SOURCE_STATUS_META } from "@/lib/labels";
import { dataSourceCounts, sortDataSources } from "@/lib/settings";
import type { DataSourceSetting, DataSourceStatus } from "@/lib/types";

const SUMMARY: DataSourceStatus[] = ["ok", "degraded", "down", "not_integrated"];

export function DataSourceSettings({ sources }: { sources: DataSourceSetting[] }) {
  const counts = dataSourceCounts(sources);
  return (
    <Panel
      id="sumber-data"
      title="Sumber data"
      description="Provider yang dipakai OpenChain per chain, kondisinya saat terakhir diperiksa, dan cara mengaturnya."
      icon={DatabaseZap}
    >
      <ul aria-label="Ringkasan kondisi provider" className="flex flex-wrap gap-1.5">
        {SUMMARY.filter((status) => counts[status] > 0).map((status) => (
          <li key={status}>
            <Badge className={DATA_SOURCE_STATUS_META[status].className}>
              {DATA_SOURCE_STATUS_META[status].label} <span className="tabular-nums">{counts[status]}</span>
            </Badge>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs text-muted">
        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          API key dan URL provider hanya diatur lewat environment variable di server. Di sini hanya tampil nama variabelnya dan apakah
          sudah diisi; nilainya tidak pernah ditampilkan atau dikirim ke browser.
        </span>
      </p>
      <ul className="mt-4 space-y-3">
        {sortDataSources(sources).map((source) => {
          const status = DATA_SOURCE_STATUS_META[source.status];
          return (
            <li key={source.id} className="rounded-lg border border-line p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{source.name}</p>
                  <p className="text-xs text-muted">{DATA_SOURCE_KIND_META[source.kind].label}: {DATA_SOURCE_KIND_META[source.kind].description}</p>
                </div>
                <Badge className={status.className} title={status.description}>
                  {status.label}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-foreground/90">{source.statusNote}</p>
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
              <p className="mt-2 text-[11px] text-muted">
                {source.lastCheckedAt ? `Diperiksa ${formatDateTime(source.lastCheckedAt)}` : "Belum pernah diperiksa"}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
