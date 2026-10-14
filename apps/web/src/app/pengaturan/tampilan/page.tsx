import type { Metadata } from "next";
import { DisplaySettings } from "@/components/settings/display-settings";
import { LanguageSettings } from "@/components/settings/language-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { getAccountSettings } from "@/lib/api/settings";

export const metadata: Metadata = { title: "Tampilan" };

export default async function DisplaySettingsPage() {
  const { preferences, profile } = await getAccountSettings();
  return (
    <div className="space-y-5">
      <ThemeSettings />
      <LanguageSettings current={preferences.language} />
      <DisplaySettings preferences={preferences} profile={profile} />
    </div>
  );
}
