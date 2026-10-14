/**
 * Pengaturan akun.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak: `GET /settings`
 * → `AccountSettings`; `PATCH /settings/profile` multipart berisi
 * `displayName` dan `avatar` → `UserProfile`; `PATCH /settings/preferences`
 * → `DisplayPreferences`) tanpa mengubah komponen yang memakainya.
 */
import { MOCK_SETTINGS } from "../mock/settings";
import { validateAvatarFile, validateDisplayName, type AvatarChange } from "../profile";
import type { AccountSettings, DisplayPreferences, UserProfile } from "../types";

const MOCK_LATENCY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAccountSettings(): Promise<AccountSettings> {
  await delay(MOCK_LATENCY_MS);
  return structuredClone(MOCK_SETTINGS);
}

/**
 * Simulasi ubah profil: foto hanya dibaca di browser (URL objek lokal), tidak
 * diunggah. Perubahan tidak tersimpan setelah halaman dimuat ulang.
 */
export async function updateProfile(profile: UserProfile, input: { displayName: string; avatar: AvatarChange }): Promise<UserProfile> {
  const nameError = validateDisplayName(input.displayName);
  if (nameError) throw new Error(nameError);
  if (input.avatar.kind === "replace") {
    const fileError = validateAvatarFile(input.avatar.file);
    if (fileError) throw new Error(fileError);
  }
  await delay(MOCK_LATENCY_MS);
  const avatarUrl = input.avatar.kind === "keep" ? profile.avatarUrl : input.avatar.kind === "remove" ? null : URL.createObjectURL(input.avatar.file);
  return { ...profile, displayName: input.displayName.trim(), avatarUrl };
}

/** Simulasi simpan preferensi tampilan; perubahan tidak tersimpan setelah halaman dimuat ulang. */
export async function updateDisplayPreferences(current: DisplayPreferences, changes: Partial<DisplayPreferences>): Promise<DisplayPreferences> {
  await delay(MOCK_LATENCY_MS);
  return { ...current, ...changes };
}
