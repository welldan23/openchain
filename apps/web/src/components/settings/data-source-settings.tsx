import { DatabaseZap, KeyRound } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { formatDateTime } from "@/lib/format";
import { sortDataSources } from "@/lib/settings";
import type { DataSourceSetting } from "@/lib/types";
import { DataSourceList } from "./data-source-list";

export function DataSourceSettings({ sources }: { sources: DataSourceSetting[] }) {
  const sorted = sortDataSources(sources);
  // Waktu diformat di server supaya teksnya sama saat hidrasi.
  const checkedLabels = Object.fromEntries(sorted.map((source) => [source.id, source.lastCheckedAt ? `Diperiksa ${formatDateTime(source.lastCheckedAt)}` : "Belum pernah diperiksa"]));
  return (
    <Panel
      id="sumber-data"
      title="Sumber data"
      description="Provider yang dipakai OpenChain per chain, kondisinya saat terakhir diperiksa, dan apakah dipakai untuk analisismu."
      icon={DatabaseZap}
    >
      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs text-muted">
        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          API key dan URL provider hanya diatur lewat environment variable di server. Di sini hanya tampil nama variabelnya dan apakah
          sudah diisi; nilainya tidak pernah ditampilkan atau dikirim ke browser. Saklar hanya mengatur sumber mana yang dipakai untuk
          analisis akunmu.
        </span>
      </p>
      <DataSourceList initial={sorted} checkedLabels={checkedLabels} />
    </Panel>
  );
}
