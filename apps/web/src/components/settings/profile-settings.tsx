import { Archive, FileText, FolderOpen, History, UserRound } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { formatNumber } from "@/lib/format";
import { ProfileEditor } from "./profile-editor";
import type { AccountSettings } from "@/lib/types";

export function ProfileSettings({ profile, storage }: Pick<AccountSettings, "profile" | "storage">) {
  const stored = [
    { label: "Kasus", count: storage.cases, href: "/kasus", icon: FolderOpen },
    { label: "Laporan", count: storage.reports, href: "/laporan", icon: FileText },
    { label: "Riwayat", count: storage.history, href: "/riwayat", icon: History },
  ];
  return (
    <div className="space-y-5">
      <Panel id="profil-pengguna" title="Profil pengguna" description="Identitas akun untuk kasus dan laporan yang kamu simpan." icon={UserRound}>
        <ProfileEditor initial={profile} />
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
