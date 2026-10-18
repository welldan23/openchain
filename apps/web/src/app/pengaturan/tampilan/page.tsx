import type { Metadata } from "next";
import { DisplaySettings } from "@/components/settings/display-settings";
import { FormatSettings } from "@/components/settings/format-settings";
import { LanguageSettings } from "@/components/settings/language-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { requireSignIn } from "@/lib/api/require-sign-in";
import { getAccountSettings } from "@/lib/api/settings";

export const metadata: Metadata = { title: "Tampilan" };

export default async function DisplaySettingsPage() {
  await requireSignIn("/pengaturan/tampilan");
  const { preferences, profile } = await getAccountSettings();
  return (
    <div className="space-y-5">
      <ThemeSettings />
      <LanguageSettings current={preferences.language} />
      <FormatSettings initial={preferences} timeZone={profile.timezone} />
      <DisplaySettings preferences={preferences} />
    </div>
  );
}
