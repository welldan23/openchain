import { MonitorCog } from "lucide-react";
import { ChainBadge } from "@/components/badges";
import { Panel } from "@/components/ui/panel";
import { DENSITY_META } from "@/lib/labels";
import type { DisplayPreferences } from "@/lib/types";

export function DisplaySettings({ preferences }: { preferences: DisplayPreferences }) {
  const rows = [{ label: "Kerapatan tampilan", value: DENSITY_META[preferences.density], hint: null as string | null }];
  return (
    <Panel id="preferensi-tampilan" title="Tampilan lain" description="Kerapatan halaman dan chain bawaan pencarian." icon={MonitorCog}>
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="text-right text-sm text-foreground">
              {row.value}
              {row.hint ? <span className="block text-xs text-muted">{row.hint}</span> : null}
            </dd>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 last:pb-0">
          <dt className="text-sm text-muted">Chain bawaan pencarian</dt>
          <dd className="text-right">
            {preferences.defaultChain ? <ChainBadge chain={preferences.defaultChain} /> : <span className="text-sm text-muted">Belum ada chain yang lolos smoke test</span>}
            {preferences.defaultChainNote ? <span className="mt-1 block text-xs text-muted">{preferences.defaultChainNote}</span> : null}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
