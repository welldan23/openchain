import { MonitorCog } from "lucide-react";
import { ChainBadge } from "@/components/badges";
import { Panel } from "@/components/ui/panel";
import { DENSITY_META, NUMBER_LOCALE_META, TIME_DISPLAY_META } from "@/lib/labels";
import type { DisplayPreferences, UserProfile } from "@/lib/types";

export function DisplaySettings({ preferences, profile }: { preferences: DisplayPreferences; profile: UserProfile }) {
  const rows = [
    { label: "Format angka", value: NUMBER_LOCALE_META[preferences.numberLocale].label, hint: `Contoh: ${NUMBER_LOCALE_META[preferences.numberLocale].example}` },
    {
      label: "Waktu ditampilkan dalam",
      value: TIME_DISPLAY_META[preferences.timeDisplay],
      hint: preferences.timeDisplay === "local" ? profile.timezone : "Sama untuk semua pembaca laporan.",
    },
    { label: "Kerapatan tampilan", value: DENSITY_META[preferences.density], hint: null },
  ];
  return (
    <Panel id="preferensi-tampilan" title="Format dan tampilan lain" description="Cara angka, waktu, dan halaman ditampilkan untukmu." icon={MonitorCog}>
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
          <dd>
            <ChainBadge chain={preferences.defaultChain} />
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
