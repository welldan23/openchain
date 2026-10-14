import type { Metadata } from "next";
import { DisplaySettings } from "@/components/settings/display-settings";
import { getAccountSettings } from "@/lib/api/settings";

export const metadata: Metadata = { title: "Tampilan" };

export default async function DisplaySettingsPage() {
  const { preferences, profile } = await getAccountSettings();
  return <DisplaySettings preferences={preferences} profile={profile} />;
}
