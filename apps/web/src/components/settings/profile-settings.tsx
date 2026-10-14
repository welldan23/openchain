import { Archive, FileText, FolderOpen, History, UserRound } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { formatDate, formatNumber } from "@/lib/format";
import { initials } from "@/lib/settings";
import type { AccountSettings } from "@/lib/types";

export function ProfileSettings({ profile, storage }: Pick<AccountSettings, "profile" | "storage">) {
  const rows = [
    { label: "Nama tampilan", value: profile.displayName },
    { label: "Email", value: profile.email },
    { label: "Zona waktu", value: profile.timezone },
    { label: "Bergabung", value: formatDate(profile.joinedAt) },
  ];
  const stored = [
    { label: "Kasus", count: storage.cases, href: "/kasus", icon: FolderOpen },
    { label: "Laporan", count: storage.reports, href: "/laporan", icon: FileText },
    { label: "Riwayat", count: storage.history, href: "/riwayat", icon: History },
  ];
  return (
    <div className="space-y-5">
      <Panel id="profil-pengguna" title="Profil pengguna" description="Identitas akun untuk kasus dan laporan yang kamu simpan." icon={UserRound}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-accent/15 text-lg font-semibold text-accent ring-1 ring-accent/30">
            {initials(profile.displayName)}
          </span>
          <dl className="grid flex-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-xs text-muted">{row.label}</dt>
                <dd className="mt-0.5 truncate text-sm text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>
      <Panel id="isi-tersimpan" title="Isi tersimpan" description="Investigasi yang tersimpan di akun ini." icon={Archive}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {stored.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5 transition hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <item.icon className="size-4 text-accent" aria-hidden />
                <span className="text-sm text-foreground">{item.label}</span>
                <span className="ml-auto text-sm font-semibold tabular-nums">{formatNumber(item.count)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
