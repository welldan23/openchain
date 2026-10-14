import type { Metadata } from "next";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { getAccountSettings } from "@/lib/api/settings";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfileSettingsPage() {
  const { profile, storage } = await getAccountSettings();
  return <ProfileSettings profile={profile} storage={storage} />;
}
