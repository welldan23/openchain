import type { Metadata } from "next";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { requireSignIn } from "@/lib/api/require-sign-in";
import { getAccountSettings } from "@/lib/api/settings";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfileSettingsPage() {
  await requireSignIn("/pengaturan/profil");
  const { profile, storage } = await getAccountSettings();
  return <ProfileSettings profile={profile} storage={storage} />;
}
