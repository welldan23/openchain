import type { Metadata } from "next";
import { MockDataNotice } from "@/components/mock-data-notice";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export const metadata: Metadata = {
  title: { default: "Pengaturan", template: "%s · Pengaturan · OpenChain Intelligence" },
  description: "Profil, preferensi tampilan, dan sumber data akun OpenChain.",
};

export default function SettingsLayout({ children }: LayoutProps<"/pengaturan">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Pengaturan</h1>
        <p className="mt-1 text-sm text-muted">Profil akun, cara data ditampilkan, dan sumber data yang dipakai analisis.</p>
      </div>
      <SettingsTabs />
      {children}
    </main>
  );
}
